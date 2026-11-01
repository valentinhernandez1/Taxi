/**
 * Viajes (flujo 1): efectivo, tarjeta o fiado. La facturación es la suma de
 * viajes por su fecha, cualquiera sea la forma de pago (§4); la plata se mueve
 * según cómo se pagó:
 * - efectivo → lo tiene el chofer (a entregar) o, sin chofer, la caja;
 * - tarjeta  → queda "a acreditar por Handy" hasta que cae al banco;
 * - fiado    → no mueve plata: es deuda del cliente (caso 1).
 */
import { aNumeric, type Centesimos, coberturaDelPeriodo, type Dia, desdeNumeric, diasDelRango } from "@taxis/shared";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { cliente, coche, diaSinTrabajo, persona, viaje } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { hoy, validarDia } from "./comun";
import { cuentaAEntregar, cuentaBase, registrarMovimiento, revertirMovimientos } from "./cuentas";
import { turnoDelViaje } from "./turnos";
import { anotarFiado, anularFiado, esDuplicado, validarCoche, validarPersona } from "./fiados";

export interface NuevoViaje {
  op_key: string;
  fecha: Dia;
  importe: Centesimos;
  forma_pago: "efectivo" | "tarjeta" | "fiado";
  chofer_id?: number | null;
  coche_id?: number | null;
  cliente_id?: number | null;
  confirmar_limite?: boolean;
}

/** El efectivo lo tiene el chofer hasta que lo entrega; si manejó el dueño (o no se sabe quién), va a la caja. */
async function dondeQuedaElEfectivo(tx: DbOTx, choferId: number | null | undefined): Promise<number> {
  if (choferId == null) return cuentaBase(tx, "caja");
  const [p] = await tx.select({ tipo: persona.tipo }).from(persona).where(eq(persona.id, choferId));
  if (p?.tipo === "dueno") return cuentaBase(tx, "caja");
  return cuentaAEntregar(tx, choferId);
}

export async function anotarViaje(db: Db, usuarioId: number, entrada: NuevoViaje) {
  // El coche se completa según el turno del chofer ese día (si tiene uno solo).
  const delTurno = await turnoDelViaje(db, entrada.chofer_id, entrada.fecha, entrada.coche_id);
  const datos = { ...entrada, coche_id: entrada.coche_id ?? delTurno?.coche_id ?? null, turno_id: delTurno?.turno_id ?? null };
  if (datos.forma_pago === "fiado") {
    if (!datos.cliente_id) throw new ErrorNegocio("Elegí quién quedó debiendo");
    const r = await anotarFiado(db, usuarioId, { ...datos, cliente_id: datos.cliente_id });
    return { viaje_id: r.viaje_id, repetido: r.repetido, cliente: r.cliente };
  }
  validarDia(datos.fecha);
  const [ya] = await db.select({ id: viaje.id }).from(viaje).where(eq(viaje.op_key, datos.op_key));
  if (ya) return { viaje_id: ya.id, repetido: true };

  try {
    const viajeId = await db.transaction(async (tx) => {
      await validarPersona(tx, datos.chofer_id, "Ese chofer");
      await validarCoche(tx, datos.coche_id);
      const [nuevo] = await tx
        .insert(viaje)
        .values({
          fecha: datos.fecha,
          importe: aNumeric(datos.importe),
          forma_pago: datos.forma_pago,
          chofer_id: datos.chofer_id ?? null,
          coche_id: datos.coche_id ?? null,
          turno_id: datos.turno_id,
          recibido_por_id: datos.forma_pago === "efectivo" ? (datos.chofer_id ?? null) : null,
          op_key: datos.op_key,
        })
        .returning({ id: viaje.id });
      const destino = datos.forma_pago === "tarjeta" ? await cuentaBase(tx, "handy") : await dondeQuedaElEfectivo(tx, datos.chofer_id);
      await registrarMovimiento(tx, {
        fecha: datos.fecha,
        importe: datos.importe,
        desde: await cuentaBase(tx, "externo"),
        hacia: destino,
        tipo: datos.forma_pago === "tarjeta" ? "viaje_tarjeta" : "viaje_efectivo",
        origenTabla: "viaje",
        origenId: nuevo!.id,
        opKey: `${datos.op_key}:mov`,
      });
      await registrarAuditoria(tx, {
        tabla: "viaje",
        registroId: nuevo!.id,
        accion: "crear",
        despues: { ...datos, importe: aNumeric(datos.importe) },
        usuarioId,
      });
      return nuevo!.id;
    });
    return { viaje_id: viajeId, repetido: false };
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otro] = await db.select({ id: viaje.id }).from(viaje).where(eq(viaje.op_key, datos.op_key));
    return { viaje_id: otro!.id, repetido: true };
  }
}

export async function anularViaje(db: Db, usuarioId: number, id: number, motivo: string) {
  const [v] = await db.select().from(viaje).where(eq(viaje.id, id));
  if (!v) throw new ErrorNegocio("Ese viaje no existe", 404);
  if (v.forma_pago === "fiado") return anularFiado(db, usuarioId, id, motivo);
  if (v.anulado) return { ok: true };
  if (v.liquidacion_id) throw new ErrorNegocio("Este viaje ya está en la liquidación de un turno. Para anularlo, primero anulá esa liquidación.");
  await db.transaction(async (tx) => {
    const [bloqueado] = await tx.select().from(viaje).where(eq(viaje.id, id)).for("update");
    if (bloqueado!.anulado) return;
    if (bloqueado!.forma_pago === "tarjeta") {
      const [acreditado] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from acreditacion_handy_viaje where viaje_id = ${id}`);
      if ((acreditado?.n ?? 0) > 0) throw new ErrorNegocio("Este viaje con tarjeta ya se acreditó en el banco; no se puede anular.");
    }
    await tx.update(viaje).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(viaje.id, id));
    await revertirMovimientos(tx, "viaje", id, hoy());
    await registrarAuditoria(tx, {
      tabla: "viaje",
      registroId: id,
      accion: "anular",
      antes: { anulado: false, importe: v.importe, forma_pago: v.forma_pago, fecha: v.fecha },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
  });
  return { ok: true };
}

/** Viajes de un día con sus totales por forma de pago (para comparar con el papel). */
export async function viajesDelDia(db: Db, fecha: Dia) {
  const filas = await db
    .select({
      id: viaje.id,
      importe: viaje.importe,
      forma_pago: viaje.forma_pago,
      origen: viaje.origen,
      anulado: viaje.anulado,
      motivo_anulacion: viaje.motivo_anulacion,
      chofer_id: viaje.chofer_id,
      chofer: persona.nombre,
      coche: coche.nombre_movil,
      cliente: cliente.nombre,
    })
    .from(viaje)
    .leftJoin(persona, eq(persona.id, viaje.chofer_id))
    .leftJoin(coche, eq(coche.id, viaje.coche_id))
    .leftJoin(cliente, eq(cliente.id, viaje.cliente_id))
    .where(and(eq(viaje.fecha, fecha), eq(viaje.origen, "normal")))
    .orderBy(asc(viaje.id));
  const totales = { efectivo: 0, tarjeta: 0, fiado: 0, total: 0 };
  const lista = filas.map((f) => {
    const importe = desdeNumeric(f.importe);
    if (!f.anulado) {
      totales[f.forma_pago] += importe;
      totales.total += importe;
    }
    return { ...f, importe };
  });
  const [marcado] = await db.select().from(diaSinTrabajo).where(eq(diaSinTrabajo.fecha, fecha));
  return { fecha, viajes: lista, totales, sin_trabajo: Boolean(marcado) };
}

/** Regla 9: qué días del período no tienen nada cargado ni están marcados "no se trabajó". */
export async function cobertura(db: Db, desde: Dia, hasta: Dia, desdeElPrimero = false) {
  if (desdeElPrimero) {
    // Para el aviso del inicio: antes del primer viaje anotado no "falta" nada.
    const [primero] = await db.execute<{ fecha: string | null }>(
      sql`select min(fecha)::text as fecha from viaje where origen = 'normal' and not anulado`,
    );
    if (!primero?.fecha || primero.fecha > hasta) return coberturaDelPeriodo(desde, desde, [desde]);
    if (primero.fecha > desde) desde = primero.fecha;
  }
  if (diasDelRango(desde, hasta).length > 400) throw new ErrorNegocio("El período es demasiado largo");
  const conViajes = await db
    .selectDistinct({ fecha: viaje.fecha })
    .from(viaje)
    .where(and(gte(viaje.fecha, desde), lte(viaje.fecha, hasta), eq(viaje.anulado, false), eq(viaje.origen, "normal")));
  const marcados = await db
    .select({ fecha: diaSinTrabajo.fecha })
    .from(diaSinTrabajo)
    .where(and(gte(diaSinTrabajo.fecha, desde), lte(diaSinTrabajo.fecha, hasta)));
  return coberturaDelPeriodo(desde, hasta, [...conViajes, ...marcados].map((f) => f.fecha));
}

export async function marcarSinTrabajo(db: Db, usuarioId: number, fecha: Dia, nota: string | null) {
  validarDia(fecha);
  await db.transaction(async (tx) => {
    const filas = await tx.insert(diaSinTrabajo).values({ fecha, nota }).onConflictDoNothing().returning();
    if (filas.length) {
      await registrarAuditoria(tx, { tabla: "dia_sin_trabajo", registroId: fecha, accion: "crear", despues: { fecha, nota }, usuarioId });
    }
  });
  return { ok: true };
}
