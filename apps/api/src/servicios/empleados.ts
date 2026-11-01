/**
 * Pagos a empleados por concepto (sueldo, jornal, adelanto, aguinaldo, salario
 * vacacional) y aguinaldo estimado (especificación §4, Gastos, punto 6).
 */
import { aguinaldoEstimado, aNumeric, type Centesimos, type ConceptoPago, type Dia, desdeNumeric } from "@taxis/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { pagoEmpleado, persona } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { hoy, validarDia } from "./comun";
import { cuentaBase, registrarMovimiento, revertirMovimientos } from "./cuentas";
import { esDuplicado } from "./fiados";
import { type ConQuePlata, cuentaDePago, rangoDelPeriodo } from "./gastos";

export interface NuevoPagoEmpleado {
  op_key: string;
  persona_id: number;
  concepto: ConceptoPago;
  /** A qué mes corresponde, "AAAA-MM". */
  periodo: string;
  importe: Centesimos;
  fecha: Dia;
  pagado_con: ConQuePlata;
}

export async function anotarPagoEmpleado(db: Db, usuarioId: number, datos: NuevoPagoEmpleado) {
  validarDia(datos.fecha);
  const [ya] = await db.select({ id: pagoEmpleado.id }).from(pagoEmpleado).where(eq(pagoEmpleado.op_key, datos.op_key));
  if (ya) return { pago_id: ya.id, repetido: true };
  try {
    const id = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(persona).where(eq(persona.id, datos.persona_id));
      if (!p?.activo) throw new ErrorNegocio("Esa persona no existe o está dada de baja");
      if (p.tipo === "dueno") throw new ErrorNegocio("Los pagos a empleados no son para el dueño");
      const cuenta = await cuentaDePago(tx, datos.pagado_con);
      const [nuevo] = await tx
        .insert(pagoEmpleado)
        .values({
          persona_id: datos.persona_id,
          concepto: datos.concepto,
          periodo: datos.periodo,
          importe: aNumeric(datos.importe),
          fecha: datos.fecha,
          pagado_desde: cuenta,
          op_key: datos.op_key,
        })
        .returning();
      await registrarMovimiento(tx, {
        fecha: datos.fecha,
        importe: datos.importe,
        desde: cuenta,
        hacia: await cuentaBase(tx, "externo"),
        tipo: "pago_empleado",
        origenTabla: "pago_empleado",
        origenId: nuevo!.id,
        opKey: `${datos.op_key}:pago`,
      });
      await registrarAuditoria(tx, { tabla: "pago_empleado", registroId: nuevo!.id, accion: "crear", despues: nuevo, usuarioId });
      return nuevo!.id;
    });
    return { pago_id: id, repetido: false };
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otro] = await db.select({ id: pagoEmpleado.id }).from(pagoEmpleado).where(eq(pagoEmpleado.op_key, datos.op_key));
    if (!otro) throw error;
    return { pago_id: otro.id, repetido: true };
  }
}

export async function anularPagoEmpleado(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [pago] = await tx.select().from(pagoEmpleado).where(eq(pagoEmpleado.id, id)).for("update");
    if (!pago) throw new ErrorNegocio("Ese pago no existe", 404);
    if (pago.anulado) return { ok: true };
    await tx.update(pagoEmpleado).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(pagoEmpleado.id, id));
    await revertirMovimientos(tx, "pago_empleado", id, hoy());
    await registrarAuditoria(tx, {
      tabla: "pago_empleado",
      registroId: id,
      accion: "anular",
      antes: { anulado: false, importe: pago.importe, concepto: pago.concepto },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
    return { ok: true };
  });
}

/** Pagos del mes por persona y por concepto, y aguinaldo estimado del semestre en curso. */
export async function resumenEmpleados(db: Db, periodo: string) {
  const { desde, hasta } = rangoDelPeriodo(periodo);
  const dia = hoy();
  const personas = await db.select().from(persona).where(sql`${persona.tipo} <> 'dueno' and ${persona.activo}`).orderBy(persona.nombre);
  // Todo lo necesario para el mes pedido y para el semestre del aguinaldo (hasta un año atrás alcanza).
  const pagos = await db.execute<{
    id: string;
    persona_id: string;
    concepto: ConceptoPago;
    periodo: string;
    importe: string;
    fecha: string;
    anulado: boolean;
    motivo_anulacion: string | null;
  }>(sql`
    select id::text, persona_id::text, concepto::text as concepto, periodo, importe::text, fecha::text, anulado, motivo_anulacion
    from pago_empleado
    where (fecha between ${desde} and ${hasta}) or fecha >= (${dia}::date - interval '1 year')
    order by fecha desc, id desc`);
  const lista = pagos.map((p) => ({ ...p, id: Number(p.id), persona_id: Number(p.persona_id), importe: desdeNumeric(p.importe) }));
  const vigentes = lista.filter((p) => !p.anulado);
  const delMes = lista.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const porConcepto: Record<ConceptoPago, number> = { sueldo: 0, jornal: 0, adelanto: 0, aguinaldo: 0, salario_vacacional: 0 };
  for (const p of delMes) if (!p.anulado) porConcepto[p.concepto] += p.importe;

  const filas = personas.map((p) => {
    const suyos = vigentes.filter((x) => x.persona_id === p.id);
    const aguinaldo = aguinaldoEstimado(suyos, dia);
    return {
      persona_id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      pagado_en_el_mes: suyos.filter((x) => x.fecha >= desde && x.fecha <= hasta).reduce((s, x) => s + x.importe, 0),
      aguinaldo_estimado: aguinaldo.importe,
    };
  });
  const semestre = aguinaldoEstimado([], dia);
  return {
    periodo,
    total_del_mes: Object.values(porConcepto).reduce((s, x) => s + x, 0),
    por_concepto: porConcepto,
    personas: filas,
    pagos: delMes,
    aguinaldo: {
      desde: semestre.desde,
      hasta: semestre.hasta,
      se_paga: semestre.se_paga,
      total_estimado: filas.reduce((s, p) => s + p.aguinaldo_estimado, 0),
    },
  };
}
