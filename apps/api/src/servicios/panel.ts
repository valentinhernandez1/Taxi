/**
 * Panel, Ganancia y Dónde ganar más (especificación §4 y Etapa 8).
 *
 * - Facturación: viajes del mes por su fecha, cualquier forma de pago, sin la
 *   carga inicial.
 * - Cobrado: plata que entró de verdad en el mes: viajes en efectivo, tarjetas
 *   acreditadas (lo que había, la comisión es gasto) y cobros de fiados.
 * - Ganancia: facturación − gastos devengados − parte de los choferes.
 * Si faltan días o viajes sin liquidar, los totales dicen "incompleto" (regla 9).
 */
import {
  centesimos,
  cuentaDelMes,
  desdeNumeric,
  generarSugerencias,
  sumarMeses,
} from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { llamadaPerdida, sugerenciaEstado } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { hoy, validarDia } from "./comun";
import { coberturaDelMes, listarVencimientos, rangoDelPeriodo } from "./gastos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (periodo: string) => MESES[Number(periodo.slice(5, 7)) - 1]!;
const n = (x: string | null | undefined) => desdeNumeric(x ?? "0");

/** Categorías que cuentan como mantenimiento del coche (para "coche que gasta de más"). */
const MANTENIMIENTO = ["Taller", "Repuestos", "Gomería"];

/**
 * Parte de los choferes devengada en el mes, repartida por viaje: a cada viaje
 * liquidado le toca su proporción de la parte de su liquidación. Más lo que se
 * pagó de fiados cobrados (regla B) y los sueldos de choferes del mes.
 */
async function parteDeChoferes(db: Db, desde: string, hasta: string) {
  const porCoche = await db.execute<{ coche_id: string | null; parte: string }>(sql`
    select v.coche_id::text, round(sum((l.parte_chofer - l.parte_fiados_cobrados) * v.importe / nullif(l.facturado, 0)), 2)::text as parte
    from viaje v join liquidacion l on l.id = v.liquidacion_id and l.estado = 'confirmada'
    where not v.anulado and v.origen = 'normal' and v.fecha between ${desde} and ${hasta}
    group by v.coche_id`);
  const [extra] = await db.execute<{ cobrados: string; sueldos: string }>(sql`
    select
      (select coalesce(sum(parte_fiados_cobrados), 0) from liquidacion where estado = 'confirmada' and fecha between ${desde} and ${hasta})::text as cobrados,
      (select coalesce(sum(pe.importe), 0) from pago_empleado pe join persona p on p.id = pe.persona_id
        where not pe.anulado and p.tipo = 'chofer' and pe.periodo = ${desde.slice(0, 7)})::text as sueldos`);
  const total = porCoche.reduce((s, f) => s + n(f.parte), 0) + n(extra?.cobrados) + n(extra?.sueldos);
  return { total: centesimos(total), porCoche: new Map(porCoche.map((f) => [f.coche_id === null ? null : Number(f.coche_id), n(f.parte)])) };
}

export async function gananciaDelMes(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const dias = Number(hasta.slice(8, 10));
  const [v] = await db.execute<{ efectivo: string; tarjeta: string; fiado: string; sin_liquidar: number }>(sql`
    select
      coalesce(sum(importe) filter (where forma_pago = 'efectivo'), 0)::text as efectivo,
      coalesce(sum(importe) filter (where forma_pago = 'tarjeta'), 0)::text as tarjeta,
      coalesce(sum(importe) filter (where forma_pago = 'fiado'), 0)::text as fiado,
      count(*) filter (where chofer_id is not null and liquidacion_id is null)::int as sin_liquidar
    from viaje where not anulado and origen = 'normal' and fecha between ${desde} and ${hasta}`);
  const facturado = centesimos(n(v!.efectivo) + n(v!.tarjeta) + n(v!.fiado));

  const [g] = await db.execute<{ coches: string; generales: string; cuotas: string; empleados: string }>(sql`
    select
      coalesce(sum(g.importe) filter (where not c.es_cuota_vehiculo and g.coche_id is not null), 0)::text as coches,
      coalesce(sum(g.importe) filter (where not c.es_cuota_vehiculo and g.coche_id is null), 0)::text as generales,
      coalesce(sum(g.importe) filter (where c.es_cuota_vehiculo), 0)::text as cuotas,
      (select coalesce(sum(pe.importe), 0) from pago_empleado pe join persona p on p.id = pe.persona_id
        where not pe.anulado and p.tipo <> 'chofer' and pe.periodo = ${periodo})::text as empleados
    from gasto g join categoria_gasto c on c.id = g.categoria_id
    where not g.anulado and g.fecha between ${desde} and ${hasta}`);
  const choferes = await parteDeChoferes(db, desde, hasta);
  const datos = {
    facturado,
    parte_choferes: choferes.total,
    gastos_coches: n(g!.coches),
    gastos_generales: centesimos(n(g!.generales) + n(g!.empleados)),
    cuotas: n(g!.cuotas),
    dias_del_mes: dias,
  };

  // Plata que entró de verdad (cobrado) y flujo de caja.
  const [p] = await db.execute<{ tarjeta_acreditada: string; cobros: string; gastos_pagados: string; pagos_choferes: string; pagos_empleados: string }>(sql`
    select
      (select coalesce(sum(importe_esperado), 0) from acreditacion_handy where not anulado and fecha between ${desde} and ${hasta})::text as tarjeta_acreditada,
      (select coalesce(sum(importe), 0) from cobro where not anulado and origen = 'normal' and fecha between ${desde} and ${hasta})::text as cobros,
      (select coalesce(sum(importe), 0) from gasto where not anulado and estado = 'pagado' and fecha_pago between ${desde} and ${hasta})::text as gastos_pagados,
      (select coalesce(sum(parte_chofer), 0) from liquidacion where estado = 'confirmada' and fecha between ${desde} and ${hasta})::text as pagos_choferes,
      (select coalesce(sum(importe), 0) from pago_empleado where not anulado and fecha between ${desde} and ${hasta})::text as pagos_empleados`);
  const cobrado = centesimos(n(v!.efectivo) + n(p!.tarjeta_acreditada) + n(p!.cobros));
  const salidas = centesimos(n(p!.gastos_pagados) + n(p!.pagos_choferes) + n(p!.pagos_empleados));

  // Cuánto deja cada coche: antes y después de la cuota.
  const coches = await db.execute<{ id: string; nombre: string; facturado: string; funcionamiento: string; cuotas: string }>(sql`
    select co.id::text, co.nombre_movil as nombre,
      (select coalesce(sum(importe), 0) from viaje where coche_id = co.id and not anulado and origen = 'normal' and fecha between ${desde} and ${hasta})::text as facturado,
      (select coalesce(sum(g.importe), 0) from gasto g join categoria_gasto c on c.id = g.categoria_id
        where g.coche_id = co.id and not g.anulado and not c.es_cuota_vehiculo and g.fecha between ${desde} and ${hasta})::text as funcionamiento,
      (select coalesce(sum(g.importe), 0) from gasto g join categoria_gasto c on c.id = g.categoria_id
        where g.coche_id = co.id and not g.anulado and c.es_cuota_vehiculo and g.fecha between ${desde} and ${hasta})::text as cuotas
    from coche co where co.activo order by co.nombre_movil`);
  const porCoche = coches.map((c) => {
    const parte = choferes.porCoche.get(Number(c.id)) ?? 0;
    const antes = n(c.facturado) - parte - n(c.funcionamiento);
    return {
      id: Number(c.id),
      nombre: c.nombre,
      facturado: n(c.facturado),
      parte_choferes: parte,
      funcionamiento: n(c.funcionamiento),
      antes_de_cuota: antes,
      cuotas: n(c.cuotas),
      despues_de_cuota: antes - n(c.cuotas),
    };
  });

  const cobertura = await coberturaDelMes(db, periodo);
  return {
    periodo,
    en_curso: periodo === hoy().slice(0, 7),
    completo: cobertura.completo && v!.sin_liquidar === 0,
    dias_sin_cargar: cobertura.diasSinCargar,
    viajes_sin_liquidar: v!.sin_liquidar,
    ...datos,
    ...cuentaDelMes(datos),
    por_forma: { efectivo: n(v!.efectivo), tarjeta: n(v!.tarjeta), fiado: n(v!.fiado) },
    cobrado: {
      efectivo: n(v!.efectivo),
      tarjeta_acreditada: n(p!.tarjeta_acreditada),
      cobros_de_fiados: n(p!.cobros),
      total: cobrado,
      deuda_crecio: centesimos(n(v!.fiado) - n(p!.cobros)),
    },
    flujo: {
      cobrado,
      gastos_pagados: n(p!.gastos_pagados),
      pagos_choferes: n(p!.pagos_choferes),
      pagos_empleados: n(p!.pagos_empleados),
      neto: centesimos(cobrado - salidas),
    },
    por_coche: porCoche,
  };
}

/** Totales por categoría en un mes. */
async function gastosPorCategoria(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const filas = await db.execute<{ id: string; nombre: string; coche_id: string | null; total: string }>(sql`
    select c.id::text, c.nombre, g.coche_id::text, sum(g.importe)::text as total
    from gasto g join categoria_gasto c on c.id = g.categoria_id
    where not g.anulado and not c.es_cuota_vehiculo and g.fecha between ${desde} and ${hasta}
    group by c.id, c.nombre, g.coche_id`);
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre, coche_id: f.coche_id === null ? null : Number(f.coche_id), total: n(f.total) }));
}

async function facturadoPorCoche(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const filas = await db.execute<{ coche_id: string; total: string }>(sql`
    select coche_id::text, sum(importe)::text as total from viaje
    where coche_id is not null and not anulado and origen = 'normal' and fecha between ${desde} and ${hasta}
    group by coche_id`);
  return new Map(filas.map((f) => [Number(f.coche_id), n(f.total)]));
}

/** Dónde ganar más: con los datos de un mes (por defecto, el último completo). */
export async function sugerenciasDelMes(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const anteriores = [1, 2, 3].map((k) => sumarMeses(periodo, -k));

  const viejos = await db.execute<{ nombre: string; debe: string }>(sql`
    select cl.nombre, sum(fp.pendiente)::text as debe
    from fiado_pendiente fp join cliente cl on cl.id = fp.cliente_id
    where fp.pendiente > 0 and fp.fecha < (${hoy()}::date - 30)
    group by cl.id, cl.nombre order by sum(fp.pendiente) desc`);
  const [mov] = await db.execute<{ fiados: string; cobros: string }>(sql`
    select
      (select coalesce(sum(importe), 0) from viaje where forma_pago = 'fiado' and not anulado and origen = 'normal' and fecha between ${desde} and ${hasta})::text as fiados,
      (select coalesce(sum(importe), 0) from cobro where not anulado and origen = 'normal' and fecha between ${desde} and ${hasta})::text as cobros`);

  const delMes = await gastosPorCategoria(db, periodo);
  const previos = await Promise.all(anteriores.map((m) => gastosPorCategoria(db, m)));
  const facturadoMes = await facturadoPorCoche(db, periodo);
  const facturadoPrevio = await Promise.all(anteriores.map((m) => facturadoPorCoche(db, m)));
  const cochesActivos = await db.execute<{ id: string; nombre: string }>(sql`select id::text, nombre_movil as nombre from coche where activo`);

  const suma = (lista: typeof delMes, filtro: (x: (typeof delMes)[number]) => boolean) =>
    centesimos(lista.filter(filtro).reduce((s, x) => s + x.total, 0));
  const coches = cochesActivos.map((c) => {
    const id = Number(c.id);
    const esMant = (x: (typeof delMes)[number]) => x.coche_id === id && MANTENIMIENTO.includes(x.nombre);
    return {
      id,
      nombre: c.nombre,
      facturado: facturadoMes.get(id) ?? centesimos(0),
      mantenimiento: suma(delMes, esMant),
      combustible: suma(delMes, (x) => x.coche_id === id && x.nombre === "Combustible"),
      anteriores: previos.map((lista, i) => ({ facturado: facturadoPrevio[i]!.get(id) ?? centesimos(0), mantenimiento: suma(lista, esMant) })),
    };
  });
  const categoriasIds = new Map(delMes.map((x) => [x.id, x.nombre]));
  const categorias = [...categoriasIds].map(([id, nombre]) => ({
    id,
    nombre,
    mes: suma(delMes, (x) => x.id === id),
    anteriores: previos.map((lista) => suma(lista, (x) => x.id === id)),
  }));

  const vencidos = (await listarVencimientos(db)).filter((x) => x.vencido).map((x) => ({ descripcion: x.descripcion, dias: x.dias }));
  const llamadas = await db.execute<{ fecha: string; hora: string | null }>(
    sql`select fecha::text, to_char(hora, 'HH24:MI') as hora from llamada_perdida where fecha between ${desde} and ${hasta}`,
  );

  const lista = generarSugerencias({
    nombre_mes: nombreMes(periodo),
    deuda: {
      vieja_30: centesimos(viejos.reduce((s, x) => s + n(x.debe), 0)),
      clientes_viejos: viejos.map((x) => ({ nombre: x.nombre, debe: n(x.debe) })),
      fiados_mes: n(mov!.fiados),
      cobros_mes: n(mov!.cobros),
    },
    coches,
    categorias,
    vencidos,
    llamadas: [...llamadas],
  });
  const estados = await db.select().from(sugerenciaEstado).where(eq(sugerenciaEstado.periodo, periodo));
  const cobertura = await coberturaDelMes(db, periodo);
  return {
    periodo,
    completo: cobertura.completo && periodo < hoy().slice(0, 7),
    dias_sin_cargar: cobertura.diasSinCargar,
    sugerencias: lista.map((s) => ({ ...s, estado: estados.find((e) => e.clave === s.clave)?.estado ?? null })),
  };
}

/** "Ya lo hice" / "Descartar" / "Volver a mostrar" (estado nulo). Es solo para ordenar la pantalla. */
export async function marcarSugerencia(db: Db, clave: string, periodo: string, estado: "hecha" | "descartada" | null) {
  if (estado === null) {
    await db.delete(sugerenciaEstado).where(and(eq(sugerenciaEstado.clave, clave), eq(sugerenciaEstado.periodo, periodo)));
  } else {
    await db
      .insert(sugerenciaEstado)
      .values({ clave, periodo, estado })
      .onConflictDoUpdate({ target: [sugerenciaEstado.clave, sugerenciaEstado.periodo], set: { estado } });
  }
  return { ok: true };
}

/** Lo del día y lo del mes anterior para el inicio. */
export async function panel(db: Db) {
  const dia = hoy();
  const anterior = sumarMeses(dia.slice(0, 7), -1);
  const [h] = await db.execute<{ viajes: number; facturado: string; cobros: string }>(sql`
    select
      (select count(*)::int from viaje where not anulado and origen = 'normal' and fecha = ${dia}) as viajes,
      (select coalesce(sum(importe), 0) from viaje where not anulado and origen = 'normal' and fecha = ${dia})::text as facturado,
      (select coalesce(sum(importe), 0) from cobro where not anulado and origen = 'normal' and fecha = ${dia})::text as cobros`);
  const mes = await gananciaDelMes(db, anterior);
  const ideas = await sugerenciasDelMes(db, anterior);
  const sinRendir = await db.execute<{ nombre: string; saldo: string; desde: string | null }>(sql`
    select p.nombre, s.saldo::text,
      (select min(m.fecha)::text from movimiento m where m.cuenta_hacia = s.cuenta_id
        and m.fecha >= coalesce((select max(e.fecha) from entrega e where e.persona_id = s.persona_id and not e.anulado), '-infinity'::date)) as desde
    from saldo_cuenta s join persona p on p.id = s.persona_id
    where s.tipo = 'a_entregar' and s.saldo > 0`);
  return {
    hoy: { viajes: h!.viajes, facturado: n(h!.facturado), cobros: n(h!.cobros) },
    mes_anterior: { periodo: anterior, te_quedo: mes.te_quedo, facturado: mes.facturado, completo: mes.completo },
    idea: ideas.sugerencias.find((s) => s.estado === null && s.tipo === "gana") ?? ideas.sugerencias.find((s) => s.estado === null) ?? null,
    // Personas con plata sin entregar hace más de 2 días (aviso "personas sin rendir").
    sin_rendir: sinRendir
      .filter((s) => s.desde && Date.parse(dia) - Date.parse(s.desde) > 2 * 86_400_000)
      .map((s) => ({ nombre: s.nombre, saldo: n(s.saldo), desde: s.desde! })),
  };
}

// ---------------------------------------------------------------- Llamadas perdidas

export async function listarLlamadas(db: Db) {
  return db.execute<{ id: string; fecha: string; hora: string | null; nota: string | null }>(sql`
    select id::text, fecha::text, to_char(hora, 'HH24:MI') as hora, nota from llamada_perdida
    where fecha >= (${hoy()}::date - 60) order by fecha desc, hora desc nulls last, id desc`);
}

export async function anotarLlamada(db: Db, datos: { fecha: string; hora?: string | null; nota?: string | null }) {
  validarDia(datos.fecha);
  if (datos.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.hora)) throw new ErrorNegocio("La hora no es válida");
  const [fila] = await db
    .insert(llamadaPerdida)
    .values({ fecha: datos.fecha, hora: datos.hora || null, nota: datos.nota?.trim() || null })
    .returning({ id: llamadaPerdida.id });
  return { id: fila!.id };
}

