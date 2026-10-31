/** Personas (choferes, telefonista) y coches: listas configurables en Ajustes. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { coche, persona } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";

export type TipoPersona = (typeof persona.$inferInsert)["tipo"];

export async function listarPersonas(db: Db, incluirInactivas = false) {
  return db
    .select({ id: persona.id, nombre: persona.nombre, telefono: persona.telefono, tipo: persona.tipo, activo: persona.activo })
    .from(persona)
    .where(incluirInactivas ? undefined : eq(persona.activo, true))
    .orderBy(asc(persona.tipo), asc(sql`lower(${persona.nombre})`));
}

export async function crearPersona(db: Db, usuarioId: number, datos: { nombre: string; telefono: string | null; tipo: TipoPersona }) {
  const repetida = await db
    .select({ id: persona.id })
    .from(persona)
    .where(and(sql`lower(${persona.nombre}) = ${datos.nombre.trim().toLowerCase()}`, eq(persona.activo, true)));
  if (repetida.length) throw new ErrorNegocio("Ya hay alguien con ese nombre.", 409);
  return db.transaction(async (tx) => {
    const [nueva] = await tx.insert(persona).values(datos).returning();
    await registrarAuditoria(tx, { tabla: "persona", registroId: nueva!.id, accion: "crear", despues: datos, usuarioId });
    return nueva!;
  });
}

export async function editarPersona(
  db: Db,
  usuarioId: number,
  id: number,
  cambios: { nombre?: string; telefono?: string | null; activo?: boolean },
) {
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(persona).where(eq(persona.id, id)).for("update");
    if (!antes) throw new ErrorNegocio("Esa persona no existe", 404);
    const [despues] = await tx.update(persona).set(cambios).where(eq(persona.id, id)).returning();
    await registrarAuditoria(tx, {
      tabla: "persona",
      registroId: id,
      accion: "modificar",
      antes: Object.fromEntries(Object.keys(cambios).map((k) => [k, antes[k as keyof typeof antes]])),
      despues: cambios,
      usuarioId,
    });
    return despues!;
  });
}

export async function listarCoches(db: Db, incluirInactivos = false) {
  return db
    .select({ id: coche.id, nombre_movil: coche.nombre_movil, matricula: coche.matricula, activo: coche.activo })
    .from(coche)
    .where(incluirInactivos ? undefined : eq(coche.activo, true))
    .orderBy(asc(coche.nombre_movil));
}

export async function crearCoche(db: Db, usuarioId: number, datos: { nombre_movil: string; matricula: string | null }) {
  return db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(coche).values(datos).returning();
    await registrarAuditoria(tx, { tabla: "coche", registroId: nuevo!.id, accion: "crear", despues: datos, usuarioId });
    return nuevo!;
  });
}

export async function editarCoche(
  db: Db,
  usuarioId: number,
  id: number,
  cambios: { nombre_movil?: string; matricula?: string | null; activo?: boolean },
) {
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(coche).where(eq(coche.id, id)).for("update");
    if (!antes) throw new ErrorNegocio("Ese coche no existe", 404);
    const [despues] = await tx.update(coche).set(cambios).where(eq(coche.id, id)).returning();
    await registrarAuditoria(tx, {
      tabla: "coche",
      registroId: id,
      accion: "modificar",
      antes: Object.fromEntries(Object.keys(cambios).map((k) => [k, antes[k as keyof typeof antes]])),
      despues: cambios,
      usuarioId,
    });
    return despues!;
  });
}
