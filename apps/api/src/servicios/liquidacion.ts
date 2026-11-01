/**
 * Liquidación de choferes (especificación §3 flujo 4, §4 "Liquidación"; casos
 * 10, 11 y 12). Se anota una sola vez al terminar cada turno: entran los viajes
 * del chofer que todavía no estaban liquidados.
 *
 * La plata: lo que tiene el chofer para entregar (su cuenta "a entregar") baja
 * por lo que pagó con la plata del turno, por su parte y por lo que entrega; si
 * no coincide, queda la diferencia con nota. Si su parte es mayor que lo que
 * tiene, la empresa le paga la diferencia. Después de liquidar su saldo queda
 * en cero.
 */
import {
  aNumeric,
  type Centesimos,
  calcularLiquidacion,
  centesimos,
  type CuentaLiquidacion,
  type Dia,
  desdeNumeric,
  parteDe,
  type ReglaLiquidacion,
} from "@taxis/shared";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { cuenta, fiadoIncobrable, gasto, liquidacion, persona, reglaLiquidacion, viaje } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { hoy, validarDia } from "./comun";
import { cuentaAEntregar, cuentaBase, registrarMovimiento, revertirMovimientos } from "./cuentas";
import { esDuplicado } from "./fiados";
import { anularGastoEn, type ConQuePlata, cuentaDePago, insertarGasto } from "./gastos";
import { saldoDe } from "./plata";

// ---------------------------------------------------------------- Reglas por chofer (con vigencia)

type FilaRegla = typeof reglaLiquidacion.$inferSelect;

export function aRegla(r: FilaRegla): ReglaLiquidacion {
  return {
    tipo: r.tipo,
    porcentaje_puntos: r.porcentaje_puntos,
    jornal: r.jornal === null ? null : desdeNumeric(r.jornal),
    modo_entrega: r.modo_entrega,
    momento_fiado: r.momento_fiado,
  };
}

function reglaParaMostrar(r: FilaRegla) {
  return { ...r, jornal: r.jornal === null ? null : desdeNumeric(r.jornal) };
}

/** La regla que rige para ese chofer ese día: la de vigencia más reciente que ya empezó. */
export async function reglaVigente(db: DbOTx, choferId: number, fecha: Dia): Promise<FilaRegla | null> {
  const [r] = await db
    .select()
    .from(reglaLiquidacion)
    .where(and(eq(reglaLiquidacion.chofer_id, choferId), lte(reglaLiquidacion.vigente_desde, fecha)))
    .orderBy(desc(reglaLiquidacion.vigente_desde))
    .limit(1);
  return r ?? null;
}

export async function reglasDe(db: Db, choferId: number) {
  const filas = await db.select().from(reglaLiquidacion).where(eq(reglaLiquidacion.chofer_id, choferId)).orderBy(desc(reglaLiquidacion.vigente_desde));
  return filas.map(reglaParaMostrar);
}

export interface DatosRegla {
  chofer_id: number;
  tipo: ReglaLiquidacion["tipo"];
  porcentaje_puntos?: number | null;
  jornal?: Centesimos | null;
  modo_entrega: ReglaLiquidacion["modo_entrega"];
  momento_fiado: ReglaLiquidacion["momento_fiado"];
  incobrable: "empresa" | "chofer";
  vigente_desde: Dia;
}

/**
 * Guarda la regla de un chofer desde una fecha. Una regla nueva o cambiada
 * siempre queda "sin confirmar" hasta que el dueño la confirme (regla 12).
 */
export async function guardarRegla(db: Db, usuarioId: number, datos: DatosRegla) {
  const usaPorcentaje = datos.tipo === "porcentaje" || datos.tipo === "mixto";
  const usaJornal = datos.tipo === "jornal" || datos.tipo === "mixto";
  if (usaPorcentaje && datos.porcentaje_puntos == null) throw new ErrorNegocio("Poné el porcentaje");
  if (usaJornal && datos.jornal == null) throw new ErrorNegocio("Poné cuánto cobra por turno");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(persona).where(eq(persona.id, datos.chofer_id));
    if (!p?.activo || p.tipo !== "chofer") throw new ErrorNegocio("Ese chofer no existe o está dado de baja");
    const valores = {
      chofer_id: datos.chofer_id,
      tipo: datos.tipo,
      porcentaje_puntos: usaPorcentaje ? datos.porcentaje_puntos! : null,
      jornal: usaJornal ? aNumeric(datos.jornal!) : null,
      modo_entrega: datos.modo_entrega,
      momento_fiado: datos.momento_fiado,
      incobrable: datos.incobrable,
      vigente_desde: datos.vigente_desde,
      confirmada: false,
    };
    const [antes] = await tx
      .select()
      .from(reglaLiquidacion)
      .where(and(eq(reglaLiquidacion.chofer_id, datos.chofer_id), eq(reglaLiquidacion.vigente_desde, datos.vigente_desde)));
    if (antes) {
      const usada = await tx.select({ id: liquidacion.id }).from(liquidacion).where(eq(liquidacion.regla_id, antes.id)).limit(1);
      if (usada.length) {
        throw new ErrorNegocio("Esa regla ya se usó en liquidaciones. Para cambiarla, cargá una nueva desde otra fecha.");
      }
      const [despues] = await tx.update(reglaLiquidacion).set(valores).where(eq(reglaLiquidacion.id, antes.id)).returning();
      await registrarAuditoria(tx, { tabla: "regla_liquidacion", registroId: antes.id, accion: "modificar", antes, despues, usuarioId });
      return reglaParaMostrar(despues!);
    }
    const [nueva] = await tx.insert(reglaLiquidacion).values(valores).returning();
    await registrarAuditoria(tx, { tabla: "regla_liquidacion", registroId: nueva!.id, accion: "crear", despues: nueva, usuarioId });
    return reglaParaMostrar(nueva!);
  });
}

export async function confirmarRegla(db: Db, usuarioId: number, id: number) {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(reglaLiquidacion).where(eq(reglaLiquidacion.id, id)).for("update");
    if (!r) throw new ErrorNegocio("Esa regla no existe", 404);
    if (r.confirmada) return reglaParaMostrar(r);
    const [despues] = await tx.update(reglaLiquidacion).set({ confirmada: true }).where(eq(reglaLiquidacion.id, id)).returning();
    await registrarAuditoria(tx, {
      tabla: "regla_liquidacion",
      registroId: id,
      accion: "modificar",
      antes: { confirmada: false },
      despues: { confirmada: true },
      motivo: "El dueño confirmó la regla",
      usuarioId,
    });
    return reglaParaMostrar(despues!);
  });
}

// ---------------------------------------------------------------- Lo que hay para liquidar

async function viajesSinLiquidar(tx: DbOTx, choferId: number, fecha: Dia) {
  return tx
    .select({ id: viaje.id, fecha: viaje.fecha, importe: viaje.importe, forma_pago: viaje.forma_pago, coche_id: viaje.coche_id, turno_id: viaje.turno_id })
    .from(viaje)
    .where(
      and(
        eq(viaje.chofer_id, choferId),
        isNull(viaje.liquidacion_id),
        eq(viaje.anulado, false),
        eq(viaje.origen, "normal"),
        lte(viaje.fecha, fecha),
      ),
    )
    .orderBy(viaje.fecha, viaje.id);
}

/** Regla B: fiados ya liquidados que el cliente terminó de pagar y cuya parte todavía no se le pagó al chofer. */
async function fiadosCobradosPendientes(tx: DbOTx, choferId: number) {
  const filas = await tx.execute<{ id: string; importe: string; porcentaje_puntos: number }>(sql`
    select v.id::text, v.importe::text, r.porcentaje_puntos
    from viaje v
    join liquidacion l on l.id = v.liquidacion_id and l.estado = 'confirmada'
    join regla_liquidacion r on r.id = l.regla_id
    join fiado_pendiente fp on fp.viaje_id = v.id
    where v.chofer_id = ${choferId} and v.forma_pago = 'fiado' and not v.anulado
      and r.momento_fiado = 'B' and r.porcentaje_puntos is not null
      and v.parte_fiado_liquidacion_id is null and fp.pendiente = 0
      and not exists (select 1 from fiado_incobrable fi where fi.viaje_id = v.id and not fi.anulado)`);
  return filas.map((f) => ({ id: Number(f.id), parte: parteDe(desdeNumeric(f.importe), f.porcentaje_puntos) }));
}

async function datosDelTurno(tx: DbOTx, choferId: number, fecha: Dia) {
  const viajes = await viajesSinLiquidar(tx, choferId, fecha);
  const totales = { efectivo: 0, tarjeta: 0, fiado: 0 };
  const cantidades = { efectivo: 0, tarjeta: 0, fiado: 0 };
  for (const v of viajes) {
    totales[v.forma_pago] += desdeNumeric(v.importe);
    cantidades[v.forma_pago] += 1;
  }
  const cobrados = await fiadosCobradosPendientes(tx, choferId);
  // Fiados incobrables de este chofer todavía sin aplicar, de viajes ya liquidados o de este turno.
  const enEsteTurno = new Set(viajes.map((v) => v.id));
  const incobrables = (
    await tx.execute<{ id: string; viaje_id: string; liquidado: boolean; descuento: string; parte: string }>(sql`
      select fi.id::text, fi.viaje_id::text, v.liquidacion_id is not null as liquidado,
        fi.descuento_chofer::text as descuento, fi.parte_a_pagar::text as parte
      from fiado_incobrable fi join viaje v on v.id = fi.viaje_id
      where fi.chofer_id = ${choferId} and not fi.anulado and fi.liquidacion_id is null
        and (fi.descuento_chofer > 0 or fi.parte_a_pagar > 0)`)
  )
    .filter((f) => f.liquidado || enEsteTurno.has(Number(f.viaje_id)))
    .map((f) => ({ id: Number(f.id), descuento: desdeNumeric(f.descuento), parte: desdeNumeric(f.parte) }));
  const cuentaChofer = await cuentaAEntregar(tx, choferId);
  // De qué turnos son los viajes (para mostrar "terminó el turno noche del Móvil 1" y guardar el turno).
  const idsTurno = [...new Set(viajes.map((v) => v.turno_id).filter((x): x is number => x != null))];
  const turnos = idsTurno.length
    ? await tx.execute<{ id: string; fecha: string; coche: string; turno: string }>(sql`
        select t.id::text, t.fecha::text, co.nombre_movil as coche, p.nombre as turno
        from turno t join coche co on co.id = t.coche_id join plantilla_turno p on p.id = t.plantilla_id
        where t.id in ${sql.raw(`(${idsTurno.join(",")})`)} order by t.fecha, p.hora_inicio`)
    : [];
  return {
    viajes,
    turnos: turnos.map((t) => ({ id: Number(t.id), fecha: t.fecha, coche: t.coche, turno: t.turno })),
    /** Si todos los viajes son de un mismo turno, la liquidación es de ese turno. */
    turno_id: idsTurno.length === 1 && viajes.every((v) => v.turno_id === idsTurno[0]) ? idsTurno[0]! : null,
    incobrables,
    totales,
    cantidades,
    cobrados,
    desde: viajes[0]?.fecha ?? null,
    hasta: viajes.at(-1)?.fecha ?? null,
    cuentaChofer,
    plata_en_mano: await saldoDe(tx, cuentaChofer),
  };
}

function calcular(regla: FilaRegla, d: Awaited<ReturnType<typeof datosDelTurno>>, gastos: Centesimos): CuentaLiquidacion {
  try {
    return calcularLiquidacion(aRegla(regla), {
      efectivo: centesimos(d.totales.efectivo),
      tarjeta: centesimos(d.totales.tarjeta),
      fiado: centesimos(d.totales.fiado),
      fiados_cobrados: centesimos(d.cobrados.reduce((s, c) => s + c.parte, 0) + d.incobrables.reduce((s, c) => s + c.parte, 0)),
      descuentos: centesimos(d.incobrables.reduce((s, c) => s + c.descuento, 0)),
      gastos,
      plata_en_mano: d.plata_en_mano,
    });
  } catch (e) {
    throw new ErrorNegocio((e as Error).message);
  }
}

/** La cuenta del turno, sin guardar nada (para mostrarla en el asistente). */
export async function cuentaDelTurno(db: Db, choferId: number, fecha: Dia, gastos: Centesimos) {
  const [p] = await db.select().from(persona).where(eq(persona.id, choferId));
  if (!p) throw new ErrorNegocio("Ese chofer no existe", 404);
  const regla = await reglaVigente(db, choferId, fecha);
  const d = await datosDelTurno(db, choferId, fecha);
  return {
    chofer: { id: p.id, nombre: p.nombre },
    regla: regla ? reglaParaMostrar(regla) : null,
    viajes: { cantidades: d.cantidades, totales: d.totales, desde: d.desde, hasta: d.hasta },
    turnos: d.turnos,
    fiados_cobrados: d.cobrados.length,
    incobrables: d.incobrables.length,
    plata_en_mano: d.plata_en_mano,
    cuenta: regla ? calcular(regla, d, gastos) : null,
  };
}

/** Choferes con su regla vigente, si está confirmada, lo que tienen y si hay viajes sin liquidar. */
export async function listarChoferes(db: Db) {
  const dia = hoy();
  const choferes = await db
    .select()
    .from(persona)
    .where(and(eq(persona.tipo, "chofer"), eq(persona.activo, true)))
    .orderBy(persona.nombre);
  const pendientes = await db.execute<{ chofer_id: string; viajes: number; desde: string; ultimo_turno: string | null }>(sql`
    select v.chofer_id::text, count(*)::int as viajes, min(v.fecha)::text as desde,
      (select p.nombre || ' del ' || co.nombre_movil || '|' || t.fecha::text
        from turno t join plantilla_turno p on p.id = t.plantilla_id join coche co on co.id = t.coche_id
        where t.id = max(v.turno_id)) as ultimo_turno
    from viaje v
    where v.liquidacion_id is null and not v.anulado and v.origen = 'normal' and v.chofer_id is not null
    group by v.chofer_id`);
  const saldos = await db.execute<{ persona_id: string; saldo: string }>(
    sql`select persona_id::text, saldo::text from saldo_cuenta where tipo = 'a_entregar'`,
  );
  const resultado = [];
  for (const c of choferes) {
    const regla = await reglaVigente(db, c.id, dia);
    const p = pendientes.find((x) => Number(x.chofer_id) === c.id);
    resultado.push({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      regla: regla ? reglaParaMostrar(regla) : null,
      para_entregar: desdeNumeric(saldos.find((s) => Number(s.persona_id) === c.id)?.saldo ?? "0"),
      viajes_sin_liquidar: p?.viajes ?? 0,
      sin_liquidar_desde: p?.desde ?? null,
      /** "Noche del Móvil 1|2026-10-31": el último turno con viajes sin liquidar. */
      ultimo_turno: p?.ultimo_turno ?? null,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------- Liquidar

export interface NuevaLiquidacion {
  op_key: string;
  chofer_id: number;
  fecha: Dia;
  /** Lo que pagó con la plata del turno (por ejemplo, combustible). */
  gasto?: { categoria_id: number; importe: Centesimos } | null;
  /** Lo que entregó (cuando le toca entregar). */
  entregado?: Centesimos | null;
  nota?: string | null;
  /** Cuando la empresa le tiene que pagar: de dónde sale esa plata. */
  pagado_con?: ConQuePlata | null;
}

export async function liquidar(db: Db, usuarioId: number, datos: NuevaLiquidacion) {
  validarDia(datos.fecha);
  const [ya] = await db.select({ id: liquidacion.id }).from(liquidacion).where(eq(liquidacion.op_key, datos.op_key));
  if (ya) return { liquidacion_id: ya.id, repetido: true };
  try {
    return await db.transaction(async (tx) => {
      const [p] = await tx.select().from(persona).where(eq(persona.id, datos.chofer_id));
      if (!p?.activo || p.tipo !== "chofer") throw new ErrorNegocio("Ese chofer no existe o está dado de baja");
      const cuentaChofer = await cuentaAEntregar(tx, datos.chofer_id);
      // Un turno se liquida una sola vez: dos liquidaciones a la vez del mismo chofer esperan en fila.
      await tx.select().from(cuenta).where(eq(cuenta.id, cuentaChofer)).for("update");
      // Si el mismo pedido llegó dos veces a la vez, el segundo espera acá y encuentra el primero ya guardado.
      const [mientras] = await tx.select({ id: liquidacion.id }).from(liquidacion).where(eq(liquidacion.op_key, datos.op_key));
      if (mientras) return { liquidacion_id: mientras.id, repetido: true as const };

      const regla = await reglaVigente(tx, datos.chofer_id, datos.fecha);
      if (!regla) throw new ErrorNegocio(`Primero cargá cómo se le paga a ${p.nombre} (Más → Choferes).`);
      const d = await datosDelTurno(tx, datos.chofer_id, datos.fecha);
      if (d.viajes.length === 0 && d.cobrados.length === 0 && d.incobrables.length === 0) throw new ErrorNegocio(`${p.nombre} no tiene viajes sin liquidar.`);
      const gastos = datos.gasto?.importe ?? centesimos(0);
      const c = calcular(regla, d, gastos);

      let entregado: Centesimos;
      let diferencia: Centesimos;
      const nota = datos.nota?.trim() || null;
      if (c.esperado >= 0) {
        if (datos.entregado == null) throw new ErrorNegocio("Decí cuánto entregó");
        entregado = datos.entregado;
        diferencia = centesimos(c.esperado - entregado);
        if (diferencia !== 0 && !nota) {
          throw new ErrorNegocio(
            diferencia > 0 ? "No coincide con lo que tenía que entregar: anotá por qué falta plata." : "Entregó de más: anotá por qué.",
            400,
            { esperado: c.esperado, diferencia },
          );
        }
      } else {
        // La empresa le paga la diferencia; no hay entrega.
        entregado = c.esperado;
        diferencia = centesimos(0);
      }

      const coches = new Set(d.viajes.map((v) => v.coche_id).filter((x) => x != null));
      const [nueva] = await tx
        .insert(liquidacion)
        .values({
          chofer_id: datos.chofer_id,
          turno_id: d.turno_id,
          regla_id: regla.id,
          fecha: datos.fecha,
          facturado: aNumeric(c.facturado),
          parte_chofer: aNumeric(c.parte_total),
          adelantos_fiado: aNumeric(c.adelanto_fiados),
          parte_fiados_cobrados: aNumeric(c.parte_fiados_cobrados),
          descuentos: aNumeric(c.descuentos),
          gastos: aNumeric(gastos),
          esperado: aNumeric(c.esperado),
          entregado: aNumeric(entregado),
          diferencia: aNumeric(diferencia),
          nota,
          op_key: datos.op_key,
        })
        .returning();
      const id = nueva!.id;

      if (datos.gasto && datos.gasto.importe > 0) {
        await insertarGasto(tx, usuarioId, {
          op_key: `${datos.op_key}:gasto`,
          fecha: datos.fecha,
          importe: datos.gasto.importe,
          categoria_id: datos.gasto.categoria_id,
          coche_id: coches.size === 1 ? [...coches][0]! : null,
          descripcion: `Pagado por ${p.nombre} con la plata del turno`,
          pagado_con: { desde: "persona", persona_id: datos.chofer_id },
          liquidacion_id: id,
        });
      }

      const externo = await cuentaBase(tx, "externo");
      const comun = { fecha: datos.fecha, origenTabla: "liquidacion", origenId: id };
      if (c.parte_total > 0) {
        await registrarMovimiento(tx, { ...comun, importe: c.parte_total, desde: cuentaChofer, hacia: externo, tipo: "parte_chofer", opKey: `${datos.op_key}:parte` });
      }
      if (c.esperado < 0) {
        const origen = await cuentaDePago(tx, datos.pagado_con ?? { desde: "caja" });
        await registrarMovimiento(tx, { ...comun, importe: centesimos(-c.esperado), desde: origen, hacia: cuentaChofer, tipo: "pago_a_chofer", opKey: `${datos.op_key}:pago` });
      } else {
        if (entregado > 0) {
          await registrarMovimiento(tx, { ...comun, importe: entregado, desde: cuentaChofer, hacia: await cuentaBase(tx, "caja"), tipo: "entrega", opKey: `${datos.op_key}:entrega` });
        }
        if (diferencia > 0) {
          await registrarMovimiento(tx, { ...comun, importe: diferencia, desde: cuentaChofer, hacia: externo, tipo: "faltante_entrega", opKey: `${datos.op_key}:faltante` });
        } else if (diferencia < 0) {
          await registrarMovimiento(tx, { ...comun, importe: centesimos(-diferencia), desde: externo, hacia: cuentaChofer, tipo: "sobrante_entrega", opKey: `${datos.op_key}:sobrante` });
        }
      }

      if (d.viajes.length) {
        await tx.update(viaje).set({ liquidacion_id: id }).where(inArray(viaje.id, d.viajes.map((v) => v.id)));
      }
      if (d.cobrados.length) {
        await tx.update(viaje).set({ parte_fiado_liquidacion_id: id }).where(inArray(viaje.id, d.cobrados.map((v) => v.id)));
      }
      if (d.incobrables.length) {
        await tx.update(fiadoIncobrable).set({ liquidacion_id: id }).where(inArray(fiadoIncobrable.id, d.incobrables.map((f) => f.id)));
      }
      await registrarAuditoria(tx, {
        tabla: "liquidacion",
        registroId: id,
        accion: "crear",
        despues: { ...nueva, viajes: d.viajes.length, regla_confirmada: regla.confirmada },
        motivo: nota,
        usuarioId,
      });
      return { liquidacion_id: id, repetido: false as const, cuenta: c, regla_confirmada: regla.confirmada };
    });
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otra] = await db.select({ id: liquidacion.id }).from(liquidacion).where(eq(liquidacion.op_key, datos.op_key));
    if (!otra) throw error;
    return { liquidacion_id: otra.id, repetido: true };
  }
}

/** Nada confirmado se borra: se anula con motivo, los viajes vuelven a quedar sin liquidar y la plata vuelve como estaba. */
export async function anularLiquidacion(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [l] = await tx.select().from(liquidacion).where(eq(liquidacion.id, id)).for("update");
    if (!l) throw new ErrorNegocio("Esa liquidación no existe", 404);
    if (l.estado === "anulada") return { ok: true };
    await revertirMovimientos(tx, "liquidacion", id, hoy());
    const gastos = await tx.select({ id: gasto.id }).from(gasto).where(and(eq(gasto.liquidacion_id, id), eq(gasto.anulado, false)));
    for (const g of gastos) await anularGastoEn(tx, usuarioId, g.id, `Se anuló la liquidación: ${motivo}`, true);
    await tx.update(viaje).set({ liquidacion_id: null }).where(eq(viaje.liquidacion_id, id));
    await tx.update(viaje).set({ parte_fiado_liquidacion_id: null }).where(eq(viaje.parte_fiado_liquidacion_id, id));
    await tx.update(fiadoIncobrable).set({ liquidacion_id: null }).where(eq(fiadoIncobrable.liquidacion_id, id));
    // El turno queda libre para liquidarlo de nuevo (cuál era queda en la auditoría).
    await tx.update(liquidacion).set({ estado: "anulada", anulado_en: new Date(), motivo_anulacion: motivo, turno_id: null }).where(eq(liquidacion.id, id));
    await registrarAuditoria(tx, {
      tabla: "liquidacion",
      registroId: id,
      accion: "anular",
      antes: { estado: "confirmada", esperado: l.esperado, entregado: l.entregado, turno_id: l.turno_id },
      despues: { estado: "anulada" },
      motivo,
      usuarioId,
    });
    return { ok: true };
  });
}

export async function liquidacionesDe(db: Db, choferId: number, limite = 30) {
  const filas = await db
    .select({ l: liquidacion, confirmada: reglaLiquidacion.confirmada })
    .from(liquidacion)
    .innerJoin(reglaLiquidacion, eq(reglaLiquidacion.id, liquidacion.regla_id))
    .where(eq(liquidacion.chofer_id, choferId))
    .orderBy(desc(liquidacion.fecha), desc(liquidacion.id))
    .limit(limite);
  return filas.map(({ l, confirmada }) => ({
    id: l.id,
    fecha: l.fecha,
    facturado: desdeNumeric(l.facturado),
    parte_chofer: desdeNumeric(l.parte_chofer),
    adelantos_fiado: desdeNumeric(l.adelantos_fiado),
    parte_fiados_cobrados: desdeNumeric(l.parte_fiados_cobrados),
    descuentos: desdeNumeric(l.descuentos),
    gastos: desdeNumeric(l.gastos),
    esperado: desdeNumeric(l.esperado),
    entregado: desdeNumeric(l.entregado),
    diferencia: desdeNumeric(l.diferencia),
    nota: l.nota,
    estado: l.estado,
    motivo_anulacion: l.motivo_anulacion,
    regla_confirmada: confirmada,
  }));
}

/** Regla B: lo que se le debe al chofer por fiados de turnos ya liquidados que el cliente todavía no pagó. */
export async function pendienteFiadosB(db: Db, choferId: number): Promise<Centesimos> {
  const filas = await db.execute<{ importe: string; porcentaje_puntos: number }>(sql`
    select fp.importe::text, r.porcentaje_puntos
    from viaje v
    join liquidacion l on l.id = v.liquidacion_id and l.estado = 'confirmada'
    join regla_liquidacion r on r.id = l.regla_id
    join fiado_pendiente fp on fp.viaje_id = v.id
    where v.chofer_id = ${choferId} and r.momento_fiado = 'B' and r.porcentaje_puntos is not null
      and v.parte_fiado_liquidacion_id is null and fp.pendiente > 0
      and not exists (select 1 from fiado_incobrable fi where fi.viaje_id = v.id and not fi.anulado)`);
  return centesimos(filas.reduce((s, f) => s + parteDe(desdeNumeric(f.importe), f.porcentaje_puntos), 0));
}
