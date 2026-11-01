/**
 * Gastos (especificación §4, "Gastos"; casos 13 y 19 de §9).
 *
 * - Un gasto pendiente cuenta para la ganancia del mes (devengado) pero no
 *   mueve plata hasta que se paga (caso 13).
 * - Pagado: sale del lugar elegido (caja, banco o la plata que tiene una
 *   persona) hacia "afuera", como movimiento (regla 5).
 * - Las cuotas de compra de un coche van aparte de los gastos de
 *   funcionamiento (regla 11, caso 19).
 */
import { aNumeric, type Centesimos, type Dia, desdeNumeric, sumarDias, vencimientosHasta } from "@taxis/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { categoriaGasto, coche, gasto, gastoFijo, vencimiento } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { comprobantesDe } from "./comprobantes";
import { hoy, validarDia } from "./comun";
import { cuentaAEntregar, cuentaBase, registrarMovimiento, revertirMovimientos } from "./cuentas";
import { esDuplicado, validarCoche, validarPersona } from "./fiados";
import { cobertura } from "./viajes";

/** De dónde sale la plata de un pago. */
export interface ConQuePlata {
  desde: "caja" | "banco" | "persona";
  persona_id?: number | null;
}

export async function cuentaDePago(tx: DbOTx, plata: ConQuePlata): Promise<number> {
  if (plata.desde === "persona") {
    if (!plata.persona_id) throw new ErrorNegocio("Elegí de quién es la plata");
    await validarPersona(tx, plata.persona_id, "Esa persona");
    return cuentaAEntregar(tx, plata.persona_id);
  }
  return cuentaBase(tx, plata.desde);
}

/** Primer y último día de un período "AAAA-MM". */
export function rangoDelPeriodo(periodo: string): { desde: Dia; hasta: Dia } {
  const desde = `${periodo}-01`;
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

/** Lo que falta cargar del período, contando solo hasta hoy (regla 9). */
export async function coberturaDelMes(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const tope = hasta < hoy() ? hasta : hoy();
  if (tope < desde) return { completo: true, diasSinCargar: [] as string[] };
  return cobertura(db, desde, tope, true);
}

// ---------------------------------------------------------------- Categorías

export async function listarCategorias(db: Db) {
  return db.select().from(categoriaGasto).orderBy(asc(categoriaGasto.nombre));
}

export async function guardarCategoria(
  db: Db,
  usuarioId: number,
  id: number | null,
  datos: { nombre?: string; es_de_coche?: boolean; es_cuota_vehiculo?: boolean; activa?: boolean },
) {
  try {
    return await db.transaction(async (tx) => {
      if (id == null) {
        const [nueva] = await tx
          .insert(categoriaGasto)
          .values({ nombre: datos.nombre!, es_de_coche: datos.es_de_coche ?? false, es_cuota_vehiculo: datos.es_cuota_vehiculo ?? false })
          .returning();
        await registrarAuditoria(tx, { tabla: "categoria_gasto", registroId: nueva!.id, accion: "crear", despues: nueva, usuarioId });
        return nueva!;
      }
      const [antes] = await tx.select().from(categoriaGasto).where(eq(categoriaGasto.id, id));
      if (!antes) throw new ErrorNegocio("Esa categoría no existe", 404);
      const [despues] = await tx.update(categoriaGasto).set(datos).where(eq(categoriaGasto.id, id)).returning();
      await registrarAuditoria(tx, { tabla: "categoria_gasto", registroId: id, accion: "modificar", antes, despues, usuarioId });
      return despues!;
    });
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorNegocio("Ya hay una categoría con ese nombre");
    throw error;
  }
}

// ---------------------------------------------------------------- Gastos puntuales

export interface NuevoGasto {
  op_key: string;
  fecha: Dia;
  importe: Centesimos;
  categoria_id: number;
  coche_id?: number | null;
  descripcion?: string | null;
  /** Nulo = queda pendiente de pago. */
  pagado_con?: ConQuePlata | null;
  /** Día en que se pagó; por defecto, el día del gasto. */
  fecha_pago?: Dia | null;
}

async function insertarGasto(tx: DbOTx, usuarioId: number, datos: NuevoGasto & { gasto_fijo_id?: number | null }) {
  const [cat] = await tx.select().from(categoriaGasto).where(eq(categoriaGasto.id, datos.categoria_id));
  if (!cat?.activa) throw new ErrorNegocio("Esa categoría no existe o está dada de baja");
  if (cat.es_cuota_vehiculo && !datos.coche_id) throw new ErrorNegocio("Elegí de qué coche es la cuota");
  await validarCoche(tx, datos.coche_id);
  const fechaPago = datos.pagado_con ? (datos.fecha_pago ?? datos.fecha) : null;
  if (fechaPago) validarDia(fechaPago);
  const cuenta = datos.pagado_con ? await cuentaDePago(tx, datos.pagado_con) : null;
  const [nuevo] = await tx
    .insert(gasto)
    .values({
      fecha: datos.fecha,
      importe: aNumeric(datos.importe),
      categoria_id: datos.categoria_id,
      coche_id: datos.coche_id ?? null,
      descripcion: datos.descripcion?.trim() || null,
      estado: cuenta ? "pagado" : "pendiente",
      fecha_pago: fechaPago,
      pagado_desde: cuenta,
      gasto_fijo_id: datos.gasto_fijo_id ?? null,
      op_key: datos.op_key,
    })
    .returning();
  if (cuenta && fechaPago) {
    await registrarMovimiento(tx, {
      fecha: fechaPago,
      importe: datos.importe,
      desde: cuenta,
      hacia: await cuentaBase(tx, "externo"),
      tipo: "gasto",
      origenTabla: "gasto",
      origenId: nuevo!.id,
      opKey: `${datos.op_key}:pago`,
    });
  }
  await registrarAuditoria(tx, { tabla: "gasto", registroId: nuevo!.id, accion: "crear", despues: nuevo, usuarioId });
  return nuevo!;
}

export async function anotarGasto(db: Db, usuarioId: number, datos: NuevoGasto) {
  validarDia(datos.fecha);
  const [ya] = await db.select({ id: gasto.id }).from(gasto).where(eq(gasto.op_key, datos.op_key));
  if (ya) return { gasto_id: ya.id, repetido: true };
  try {
    const nuevo = await db.transaction((tx) => insertarGasto(tx, usuarioId, datos));
    return { gasto_id: nuevo.id, repetido: false };
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otro] = await db.select({ id: gasto.id }).from(gasto).where(eq(gasto.op_key, datos.op_key));
    if (!otro) throw error;
    return { gasto_id: otro.id, repetido: true };
  }
}

/** Caso 13: un gasto pendiente se paga después; recién ahí sale la plata. */
export async function pagarGasto(db: Db, usuarioId: number, id: number, datos: { fecha: Dia; pagado_con: ConQuePlata }) {
  validarDia(datos.fecha);
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(gasto).where(eq(gasto.id, id)).for("update");
    if (!g) throw new ErrorNegocio("Ese gasto no existe", 404);
    if (g.anulado) throw new ErrorNegocio("Ese gasto está anulado");
    if (g.estado === "pagado") return { ok: true, repetido: true };
    const cuenta = await cuentaDePago(tx, datos.pagado_con);
    await tx.update(gasto).set({ estado: "pagado", fecha_pago: datos.fecha, pagado_desde: cuenta }).where(eq(gasto.id, id));
    await registrarMovimiento(tx, {
      fecha: datos.fecha,
      importe: desdeNumeric(g.importe),
      desde: cuenta,
      hacia: await cuentaBase(tx, "externo"),
      tipo: "gasto",
      origenTabla: "gasto",
      origenId: id,
      opKey: `${g.op_key}:pago`,
    });
    await registrarAuditoria(tx, {
      tabla: "gasto",
      registroId: id,
      accion: "modificar",
      antes: { estado: "pendiente" },
      despues: { estado: "pagado", fecha_pago: datos.fecha, pagado_desde: cuenta },
      usuarioId,
    });
    return { ok: true, repetido: false };
  });
}

export async function anularGasto(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(gasto).where(eq(gasto.id, id)).for("update");
    if (!g) throw new ErrorNegocio("Ese gasto no existe", 404);
    if (g.anulado) return { ok: true };
    if (g.op_key.endsWith(":comision")) {
      throw new ErrorNegocio("La comisión de Handy sale sola de lo que cayó al banco; no se anula a mano.");
    }
    await tx.update(gasto).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(gasto.id, id));
    await revertirMovimientos(tx, "gasto", id, hoy());
    // Si venía de un vencimiento, ese vencimiento vuelve a quedar por pagar.
    const [v] = await tx.select().from(vencimiento).where(eq(vencimiento.gasto_id, id));
    if (v) {
      await tx.update(vencimiento).set({ estado: "pendiente", gasto_id: null, importe_real: null }).where(eq(vencimiento.id, v.id));
      await registrarAuditoria(tx, {
        tabla: "vencimiento",
        registroId: v.id,
        accion: "modificar",
        antes: { estado: v.estado, gasto_id: id },
        despues: { estado: "pendiente", gasto_id: null },
        motivo: `Se anuló el gasto: ${motivo}`,
        usuarioId,
      });
    }
    await registrarAuditoria(tx, {
      tabla: "gasto",
      registroId: id,
      accion: "anular",
      antes: { anulado: false, importe: g.importe, estado: g.estado },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
    return { ok: true };
  });
}

/** Gastos del mes (devengados: pagados y pendientes), con las cuotas aparte. */
export async function gastosDelMes(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const filas = await db.execute<{
    id: string;
    fecha: string;
    importe: string;
    descripcion: string | null;
    estado: "pagado" | "pendiente";
    fecha_pago: string | null;
    anulado: boolean;
    motivo_anulacion: string | null;
    categoria_id: string;
    categoria: string;
    es_cuota: boolean;
    coche: string | null;
    pagado_desde: string | null;
    automatico: boolean;
  }>(sql`
    select g.id::text, g.fecha::text, g.importe::text, g.descripcion, g.estado::text as estado, g.fecha_pago::text,
      g.anulado, g.motivo_anulacion, c.id::text as categoria_id, c.nombre as categoria, c.es_cuota_vehiculo as es_cuota,
      co.nombre_movil as coche, cu.nombre as pagado_desde, g.op_key like '%:comision' as automatico
    from gasto g
    join categoria_gasto c on c.id = g.categoria_id
    left join coche co on co.id = g.coche_id
    left join cuenta cu on cu.id = g.pagado_desde
    where g.fecha between ${desde} and ${hasta}
    order by g.fecha desc, g.id desc`);
  const ids = filas.map((f) => Number(f.id));
  const fotos = await comprobantesDe(db, "gasto", ids);
  const totales = { total: 0, pagado: 0, pendiente: 0, funcionamiento: 0, cuotas: 0 };
  const porCategoria = new Map<string, { categoria: string; es_cuota: boolean; total: number }>();
  const gastos = filas.map((f) => {
    const importe = desdeNumeric(f.importe);
    if (!f.anulado) {
      totales.total += importe;
      totales[f.estado] += importe;
      if (f.es_cuota) totales.cuotas += importe;
      else totales.funcionamiento += importe;
      const c = porCategoria.get(f.categoria) ?? { categoria: f.categoria, es_cuota: f.es_cuota, total: 0 };
      c.total += importe;
      porCategoria.set(f.categoria, c);
    }
    return { ...f, id: Number(f.id), categoria_id: Number(f.categoria_id), importe, comprobantes: fotos.get(Number(f.id)) ?? [] };
  });
  return {
    periodo,
    gastos,
    totales,
    por_categoria: [...porCategoria.values()].sort((a, b) => b.total - a.total),
    cobertura: await coberturaDelMes(db, periodo),
  };
}

// ---------------------------------------------------------------- Gastos fijos y vencimientos

export interface DatosGastoFijo {
  categoria_id: number;
  coche_id?: number | null;
  descripcion: string;
  importe?: Centesimos | null;
  importe_estimado?: boolean;
  frecuencia: "mensual" | "bimestral" | "anual" | "meses_especificos";
  meses?: number[] | null;
  dia_del_mes: number;
  primer_periodo: string;
  cuotas_total?: number | null;
  fecha_fin?: Dia | null;
  dias_aviso?: number[];
  activo?: boolean;
}

export async function listarGastosFijos(db: Db) {
  const filas = await db
    .select({
      fijo: gastoFijo,
      categoria: categoriaGasto.nombre,
      coche: coche.nombre_movil,
      pagados: sql<number>`(select count(*)::int from vencimiento v where v.gasto_fijo_id = ${gastoFijo.id} and v.estado = 'pagado')`,
    })
    .from(gastoFijo)
    .innerJoin(categoriaGasto, eq(categoriaGasto.id, gastoFijo.categoria_id))
    .leftJoin(coche, eq(coche.id, gastoFijo.coche_id))
    .orderBy(asc(gastoFijo.descripcion));
  return filas.map((f) => ({
    ...f.fijo,
    importe: f.fijo.importe === null ? null : desdeNumeric(f.fijo.importe),
    categoria: f.categoria,
    coche: f.coche,
    cuotas_pagadas: f.pagados,
  }));
}

export async function guardarGastoFijo(db: Db, usuarioId: number, id: number | null, datos: DatosGastoFijo) {
  return db.transaction(async (tx) => {
    const [cat] = await tx.select().from(categoriaGasto).where(eq(categoriaGasto.id, datos.categoria_id));
    if (!cat) throw new ErrorNegocio("Esa categoría no existe");
    if (cat.es_cuota_vehiculo && !datos.coche_id) throw new ErrorNegocio("Elegí de qué coche es la cuota");
    if (datos.frecuencia === "meses_especificos" && !datos.meses?.length) throw new ErrorNegocio("Elegí en qué meses vence");
    await validarCoche(tx, datos.coche_id);
    const valores = {
      categoria_id: datos.categoria_id,
      coche_id: datos.coche_id ?? null,
      descripcion: datos.descripcion,
      importe: datos.importe == null ? null : aNumeric(datos.importe),
      importe_estimado: datos.importe_estimado ?? false,
      frecuencia: datos.frecuencia,
      meses: datos.frecuencia === "meses_especificos" ? (datos.meses ?? null) : null,
      dia_del_mes: datos.dia_del_mes,
      primer_periodo: datos.primer_periodo,
      cuotas_total: datos.cuotas_total ?? null,
      fecha_fin: datos.fecha_fin ?? null,
      es_cuota_vehiculo: cat.es_cuota_vehiculo,
      ...(datos.dias_aviso ? { dias_aviso: datos.dias_aviso } : {}),
      ...(datos.activo === undefined ? {} : { activo: datos.activo }),
    };
    if (id == null) {
      const [nuevo] = await tx.insert(gastoFijo).values(valores).returning();
      await registrarAuditoria(tx, { tabla: "gasto_fijo", registroId: nuevo!.id, accion: "crear", despues: nuevo, usuarioId });
      return nuevo!;
    }
    const [antes] = await tx.select().from(gastoFijo).where(eq(gastoFijo.id, id));
    if (!antes) throw new ErrorNegocio("Ese gasto fijo no existe", 404);
    const [despues] = await tx.update(gastoFijo).set(valores).where(eq(gastoFijo.id, id)).returning();
    await registrarAuditoria(tx, { tabla: "gasto_fijo", registroId: id, accion: "modificar", antes, despues, usuarioId });
    return despues!;
  });
}

/** Crea (si faltan) los vencimientos de cada gasto fijo activo hasta `hasta`. Idempotente. */
export async function generarVencimientos(db: DbOTx, hasta: Dia): Promise<void> {
  const fijos = await db.select().from(gastoFijo).where(eq(gastoFijo.activo, true));
  for (const f of fijos) {
    const lista = vencimientosHasta(
      {
        frecuencia: f.frecuencia,
        meses: f.meses,
        dia_del_mes: f.dia_del_mes,
        primer_periodo: f.primer_periodo,
        fecha_fin: f.fecha_fin,
        cuotas_total: f.cuotas_total,
      },
      hasta,
    );
    if (lista.length === 0) continue;
    await db
      .insert(vencimiento)
      .values(lista.map((v) => ({ gasto_fijo_id: f.id, periodo: v.periodo, fecha_vence: v.fecha_vence, importe_estimado: f.importe })))
      .onConflictDoNothing();
  }
}

/** Lo que vence en los próximos 30 días y lo vencido sin pagar, lo vencido primero. */
export async function listarVencimientos(db: Db, opciones: { gastoFijoId?: number; cocheId?: number; dias?: number } = {}) {
  const dia = hoy();
  const hasta = sumarDias(dia, opciones.dias ?? 30);
  await generarVencimientos(db, hasta);
  const filas = await db.execute<{
    id: string;
    periodo: string;
    fecha_vence: string;
    importe_estimado: string | null;
    avisar_desde: string | null;
    descripcion: string;
    es_estimado: boolean;
    es_cuota: boolean;
    categoria_id: string;
    categoria: string;
    coche_id: string | null;
    coche: string | null;
    dias_aviso: number[];
  }>(sql`
    select v.id::text, v.periodo, v.fecha_vence::text, v.importe_estimado::text, v.avisar_desde::text,
      f.descripcion, f.importe_estimado as es_estimado, f.es_cuota_vehiculo as es_cuota, f.categoria_id::text, c.nombre as categoria,
      f.coche_id::text, co.nombre_movil as coche, f.dias_aviso
    from vencimiento v
    join gasto_fijo f on f.id = v.gasto_fijo_id
    join categoria_gasto c on c.id = f.categoria_id
    left join coche co on co.id = f.coche_id
    where v.estado = 'pendiente' and v.fecha_vence <= ${hasta}
      ${opciones.gastoFijoId ? sql`and f.id = ${opciones.gastoFijoId}` : sql``}
      ${opciones.cocheId ? sql`and f.coche_id = ${opciones.cocheId}` : sql``}
    order by v.fecha_vence, v.id`);
  return filas.map((f) => {
    const dias = Math.round((Date.parse(f.fecha_vence) - Date.parse(dia)) / 86_400_000);
    const pospuesto = f.avisar_desde != null && f.avisar_desde > dia;
    return {
      id: Number(f.id),
      periodo: f.periodo,
      fecha_vence: f.fecha_vence,
      importe_estimado: f.importe_estimado === null ? null : desdeNumeric(f.importe_estimado),
      descripcion: f.descripcion,
      es_estimado: f.es_estimado,
      es_cuota: f.es_cuota,
      categoria_id: Number(f.categoria_id),
      categoria: f.categoria,
      coche_id: f.coche_id === null ? null : Number(f.coche_id),
      coche: f.coche,
      dias,
      vencido: dias < 0,
      // Aviso: 3 días antes y el mismo día por defecto (o lo configurado), salvo "avisame mañana".
      avisar: !pospuesto && (dias < 0 || f.dias_aviso.some((d) => dias <= d)),
      pospuesto,
    };
  });
}

/** "Ya lo pagué": genera el gasto del período con el importe real (regla: se confirma el real). */
export async function pagarVencimiento(
  db: Db,
  usuarioId: number,
  id: number,
  datos: { op_key: string; fecha: Dia; importe: Centesimos; pagado_con: ConQuePlata },
) {
  validarDia(datos.fecha);
  const [ya] = await db.select({ id: gasto.id }).from(gasto).where(eq(gasto.op_key, datos.op_key));
  if (ya) return { gasto_id: ya.id, repetido: true };
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(vencimiento).where(eq(vencimiento.id, id)).for("update");
    if (!v) throw new ErrorNegocio("Ese vencimiento no existe", 404);
    if (v.estado !== "pendiente") throw new ErrorNegocio("Ese vencimiento ya está pago u omitido");
    const [f] = await tx.select().from(gastoFijo).where(eq(gastoFijo.id, v.gasto_fijo_id));
    // El gasto es del período que vence (devengado), aunque se pague antes o después.
    const nuevo = await insertarGasto(tx, usuarioId, {
      op_key: datos.op_key,
      fecha: v.fecha_vence,
      importe: datos.importe,
      categoria_id: f!.categoria_id,
      coche_id: f!.coche_id,
      descripcion: f!.descripcion,
      pagado_con: datos.pagado_con,
      fecha_pago: datos.fecha,
      gasto_fijo_id: f!.id,
    });
    await tx
      .update(vencimiento)
      .set({ estado: "pagado", importe_real: aNumeric(datos.importe), gasto_id: nuevo.id })
      .where(eq(vencimiento.id, id));
    await registrarAuditoria(tx, {
      tabla: "vencimiento",
      registroId: id,
      accion: "modificar",
      antes: { estado: "pendiente" },
      despues: { estado: "pagado", importe_real: aNumeric(datos.importe), gasto_id: nuevo.id },
      usuarioId,
    });
    return { gasto_id: nuevo.id, repetido: false };
  });
}

export async function posponerVencimiento(db: Db, id: number) {
  const [v] = await db
    .update(vencimiento)
    .set({ avisar_desde: sumarDias(hoy(), 1) })
    .where(and(eq(vencimiento.id, id), eq(vencimiento.estado, "pendiente")))
    .returning({ id: vencimiento.id });
  if (!v) throw new ErrorNegocio("Ese vencimiento no existe o ya no está pendiente", 404);
  return { ok: true };
}

/** "Este mes no corresponde": queda omitido con motivo, sin generar gasto. */
export async function omitirVencimiento(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(vencimiento).where(eq(vencimiento.id, id)).for("update");
    if (!v) throw new ErrorNegocio("Ese vencimiento no existe", 404);
    if (v.estado !== "pendiente") throw new ErrorNegocio("Ese vencimiento ya está pago u omitido");
    await tx.update(vencimiento).set({ estado: "omitido" }).where(eq(vencimiento.id, id));
    await registrarAuditoria(tx, {
      tabla: "vencimiento",
      registroId: id,
      accion: "modificar",
      antes: { estado: "pendiente" },
      despues: { estado: "omitido" },
      motivo,
      usuarioId,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------- Ficha de coche

/** Resultado por coche: facturación − gastos de funcionamiento; la cuota va abajo, aparte (caso 19). */
export async function fichaDeCoche(db: Db, cocheId: number, periodo: string) {
  const [c] = await db.select().from(coche).where(eq(coche.id, cocheId));
  if (!c) throw new ErrorNegocio("Ese coche no existe", 404);
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const [fact] = await db.execute<{ total: string; viajes: number }>(sql`
    select coalesce(sum(importe), 0)::text as total, count(*)::int as viajes from viaje
    where coche_id = ${cocheId} and not anulado and origen = 'normal' and fecha between ${desde} and ${hasta}`);
  const gastosCoche = await db.execute<{ categoria: string; es_cuota: boolean; total: string }>(sql`
    select c.nombre as categoria, c.es_cuota_vehiculo as es_cuota, sum(g.importe)::text as total
    from gasto g join categoria_gasto c on c.id = g.categoria_id
    where g.coche_id = ${cocheId} and not g.anulado and g.fecha between ${desde} and ${hasta}
    group by c.nombre, c.es_cuota_vehiculo order by sum(g.importe) desc`);
  const funcionamiento = gastosCoche.filter((g) => !g.es_cuota).map((g) => ({ categoria: g.categoria, total: desdeNumeric(g.total) }));
  const cuotas = gastosCoche.filter((g) => g.es_cuota).reduce((s, g) => s + desdeNumeric(g.total), 0);
  const totalFuncionamiento = funcionamiento.reduce((s, g) => s + g.total, 0);
  const facturado = desdeNumeric(fact!.total);
  const [cuotasPlan] = await db.execute<{ total: number | null; pagadas: number }>(sql`
    select sum(f.cuotas_total)::int as total,
      (select count(*)::int from vencimiento v join gasto_fijo f2 on f2.id = v.gasto_fijo_id
        where f2.coche_id = ${cocheId} and f2.es_cuota_vehiculo and v.estado = 'pagado') as pagadas
    from gasto_fijo f where f.coche_id = ${cocheId} and f.es_cuota_vehiculo and f.activo`);
  // La parte de los choferes llega con las liquidaciones (Etapa 7); mientras tanto no se inventa.
  const antesDeCuota = facturado - totalFuncionamiento;
  return {
    coche: c,
    periodo,
    facturado,
    viajes: fact!.viajes,
    parte_choferes: null as Centesimos | null,
    funcionamiento,
    total_funcionamiento: totalFuncionamiento,
    resultado_antes_de_cuota: antesDeCuota,
    cuotas,
    resultado_despues_de_cuota: antesDeCuota - cuotas,
    cuotas_restantes: cuotasPlan?.total == null ? null : Math.max(0, cuotasPlan.total - cuotasPlan.pagadas),
    proximos_vencimientos: (await listarVencimientos(db, { cocheId })).slice(0, 5),
    cobertura: await coberturaDelMes(db, periodo),
  };
}

