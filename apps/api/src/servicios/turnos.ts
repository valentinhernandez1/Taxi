/**
 * Turnos básicos (especificación §3 flujo 9, Etapa 9): horarios de turno,
 * grilla semanal día × coche × turno, cambio rápido de chofer, "Repetir la
 * semana anterior", huecos y superposiciones. El coche de un viaje se completa
 * según el turno del chofer ese día.
 */
import { type Dia, diasDeLaSemana, lunesDe, revisarSemana, sumarDias } from "@taxis/shared";
import { and, asc, between, eq, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { coche, persona, plantillaTurno, turno } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { hoy } from "./comun";
import { validarCoche } from "./fiados";

const hhmm = (t: string) => t.slice(0, 5);

// ---------------------------------------------------------------- Horarios de turno

export async function listarPlantillas(db: DbOTx, todas = false) {
  const filas = await db
    .select()
    .from(plantillaTurno)
    .where(todas ? undefined : eq(plantillaTurno.activa, true))
    .orderBy(asc(plantillaTurno.hora_inicio), asc(plantillaTurno.id));
  return filas.map((p) => ({ ...p, hora_inicio: hhmm(p.hora_inicio), hora_fin: hhmm(p.hora_fin) }));
}

export async function guardarPlantilla(
  db: Db,
  usuarioId: number,
  id: number | null,
  datos: { nombre?: string; hora_inicio?: string; hora_fin?: string; activa?: boolean },
) {
  if (datos.hora_inicio && datos.hora_fin && datos.hora_inicio === datos.hora_fin) {
    throw new ErrorNegocio("El turno tiene que empezar y terminar a distinta hora");
  }
  return db.transaction(async (tx) => {
    if (id == null) {
      const [nueva] = await tx
        .insert(plantillaTurno)
        .values({ nombre: datos.nombre!, hora_inicio: datos.hora_inicio!, hora_fin: datos.hora_fin! })
        .returning();
      await registrarAuditoria(tx, { tabla: "plantilla_turno", registroId: nueva!.id, accion: "crear", despues: nueva, usuarioId });
      return nueva!;
    }
    const [antes] = await tx.select().from(plantillaTurno).where(eq(plantillaTurno.id, id));
    if (!antes) throw new ErrorNegocio("Ese turno no existe", 404);
    const [despues] = await tx.update(plantillaTurno).set(datos).where(eq(plantillaTurno.id, id)).returning();
    await registrarAuditoria(tx, { tabla: "plantilla_turno", registroId: id, accion: "modificar", antes, despues, usuarioId });
    return despues!;
  });
}

// ---------------------------------------------------------------- Grilla semanal

export async function semana(db: Db, dia: Dia) {
  const lunes = lunesDe(dia);
  const domingo = sumarDias(lunes, 6);
  const coches = await db.select({ id: coche.id, nombre_movil: coche.nombre_movil }).from(coche).where(eq(coche.activo, true)).orderBy(coche.nombre_movil);
  const plantillas = await listarPlantillas(db);
  const filas = await db
    .select({ id: turno.id, fecha: turno.fecha, coche_id: turno.coche_id, plantilla_id: turno.plantilla_id, chofer_id: turno.chofer_id, sustituye_a_id: turno.sustituye_a_id })
    .from(turno)
    .where(between(turno.fecha, lunes, domingo));
  const choferes = await db
    .select({ id: persona.id, nombre: persona.nombre, tipo: persona.tipo })
    .from(persona)
    .where(and(eq(persona.activo, true), sql`${persona.tipo} in ('chofer', 'dueno')`))
    .orderBy(persona.nombre);
  const nombre = new Map(choferes.map((c) => [c.id, c.nombre]));
  const revision = revisarSemana(
    lunes,
    coches.map((c) => c.id),
    plantillas,
    filas.filter((t) => plantillas.some((p) => p.id === t.plantilla_id)),
  );
  return {
    lunes,
    dias: diasDeLaSemana(lunes),
    coches,
    plantillas,
    choferes,
    turnos: filas.map((t) => ({
      ...t,
      chofer: t.chofer_id ? (nombre.get(t.chofer_id) ?? null) : null,
      sustituye_a: t.sustituye_a_id ? (nombre.get(t.sustituye_a_id) ?? null) : null,
    })),
    huecos: revision.huecos.length,
    conflictos: revision.conflictos.map((c) => ({ ...c, chofer: nombre.get(c.chofer_id) ?? "" })),
  };
}

export interface Asignacion {
  fecha: Dia;
  coche_id: number;
  plantilla_id: number;
  chofer_id: number | null;
}

/** Cambio rápido de chofer (o "Dejar sin chofer"). Si es para hoy o antes, recuerda a quién reemplazó. */
export async function asignar(db: Db, usuarioId: number, datos: Asignacion) {
  return db.transaction(async (tx) => {
    await validarCoche(tx, datos.coche_id);
    const [p] = await tx.select().from(plantillaTurno).where(eq(plantillaTurno.id, datos.plantilla_id));
    if (!p?.activa) throw new ErrorNegocio("Ese turno no existe o no se usa más");
    if (datos.chofer_id != null) {
      const [c] = await tx.select().from(persona).where(eq(persona.id, datos.chofer_id));
      if (!c?.activo || (c.tipo !== "chofer" && c.tipo !== "dueno")) throw new ErrorNegocio("Ese chofer no existe o está dado de baja");
    }
    const [antes] = await tx
      .select()
      .from(turno)
      .where(and(eq(turno.fecha, datos.fecha), eq(turno.coche_id, datos.coche_id), eq(turno.plantilla_id, datos.plantilla_id)))
      .for("update");
    if (!antes) {
      const [nuevo] = await tx.insert(turno).values({ ...datos }).returning();
      await registrarAuditoria(tx, { tabla: "turno", registroId: nuevo!.id, accion: "crear", despues: nuevo, usuarioId });
      return nuevo!;
    }
    if (antes.chofer_id === datos.chofer_id) return antes;
    let sustituye = antes.sustituye_a_id;
    if (datos.fecha <= hoy() && antes.chofer_id != null && datos.chofer_id != null && sustituye == null) sustituye = antes.chofer_id;
    if (datos.chofer_id === sustituye) sustituye = null;
    const [despues] = await tx
      .update(turno)
      .set({ chofer_id: datos.chofer_id, sustituye_a_id: sustituye })
      .where(eq(turno.id, antes.id))
      .returning();
    await registrarAuditoria(tx, {
      tabla: "turno",
      registroId: antes.id,
      accion: "modificar",
      antes: { chofer_id: antes.chofer_id },
      despues: { chofer_id: datos.chofer_id, sustituye_a_id: sustituye },
      usuarioId,
    });
    return despues!;
  });
}

/** Copia los turnos de la semana anterior a los lugares que todavía no tienen nada decidido. */
export async function repetirSemanaAnterior(db: Db, usuarioId: number, dia: Dia) {
  const lunes = lunesDe(dia);
  const lunesAnterior = sumarDias(lunes, -7);
  return db.transaction(async (tx) => {
    const origen = await tx
      .select()
      .from(turno)
      .innerJoin(plantillaTurno, eq(plantillaTurno.id, turno.plantilla_id))
      .innerJoin(coche, eq(coche.id, turno.coche_id))
      .where(and(between(turno.fecha, lunesAnterior, sumarDias(lunes, -1)), eq(plantillaTurno.activa, true), eq(coche.activo, true)));
    if (origen.length === 0) throw new ErrorNegocio("La semana anterior no tiene turnos para copiar.");
    let copiados = 0;
    for (const { turno: t } of origen) {
      const filas = await tx
        .insert(turno)
        .values({ fecha: sumarDias(t.fecha, 7), coche_id: t.coche_id, plantilla_id: t.plantilla_id, chofer_id: t.chofer_id })
        .onConflictDoNothing()
        .returning({ id: turno.id });
      copiados += filas.length;
    }
    await registrarAuditoria(tx, {
      tabla: "turno",
      registroId: lunes,
      accion: "crear",
      despues: { semana: lunes, copiados, de_la_semana: lunesAnterior },
      motivo: "Repetir la semana anterior",
      usuarioId,
    });
    return { copiados, ya_estaban: origen.length - copiados };
  });
}

/** Turnos de un día con su coche y chofer (para completar el coche al anotar un viaje). */
export async function turnosDelDia(db: DbOTx, fecha: Dia) {
  return db
    .select({
      id: turno.id,
      coche_id: turno.coche_id,
      coche: coche.nombre_movil,
      plantilla: plantillaTurno.nombre,
      chofer_id: turno.chofer_id,
    })
    .from(turno)
    .innerJoin(coche, eq(coche.id, turno.coche_id))
    .innerJoin(plantillaTurno, eq(plantillaTurno.id, turno.plantilla_id))
    .where(eq(turno.fecha, fecha))
    .orderBy(plantillaTurno.hora_inicio);
}

/**
 * El turno de un viaje: si se sabe el coche, el turno de ese chofer en ese
 * coche ese día; si no, su único turno de ese día (y de ahí sale el coche).
 */
export async function turnoDelViaje(tx: DbOTx, choferId: number | null | undefined, fecha: Dia, cocheId: number | null | undefined) {
  if (choferId == null) return null;
  const delDia = (await turnosDelDia(tx, fecha)).filter((t) => t.chofer_id === choferId);
  const candidatos = cocheId == null ? delDia : delDia.filter((t) => t.coche_id === cocheId);
  return candidatos.length === 1 ? { turno_id: candidatos[0]!.id, coche_id: candidatos[0]!.coche_id } : null;
}
