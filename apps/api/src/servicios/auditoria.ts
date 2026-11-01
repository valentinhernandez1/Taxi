/**
 * La auditoría se escribe desde los servicios, dentro de la misma transacción
 * que el cambio, para guardar el motivo (especificación §5). La tabla no admite
 * UPDATE ni DELETE (migración 0001).
 */
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { DbOTx } from "../db/cliente";
import { auditoria, usuario } from "../db/schema";

export type AccionAuditoria = (typeof auditoria.$inferInsert)["accion"];

export interface EntradaAuditoria {
  tabla: string;
  registroId: string | number;
  accion: AccionAuditoria;
  antes?: unknown;
  despues?: unknown;
  motivo?: string | null;
  usuarioId: number | null;
}

export async function registrarAuditoria(db: DbOTx, entrada: EntradaAuditoria): Promise<void> {
  await db.insert(auditoria).values({
    tabla: entrada.tabla,
    registro_id: String(entrada.registroId),
    accion: entrada.accion,
    antes: entrada.antes ?? null,
    despues: entrada.despues ?? null,
    motivo: entrada.motivo?.trim() || null,
    usuario_id: entrada.usuarioId,
  });
}

export async function historialDe(db: DbOTx, tabla: string, registroId: string | number, limite = 50) {
  return db
    .select()
    .from(auditoria)
    .where(and(eq(auditoria.tabla, tabla), eq(auditoria.registro_id, String(registroId))))
    .orderBy(desc(auditoria.fecha), desc(auditoria.id))
    .limit(limite);
}

/**
 * Historial de cambios para mostrar en la app (regla 6: toda corrección queda
 * con antes, después y motivo). Por defecto solo anulaciones y cambios; de a
 * 50, hacia atrás desde `antesDe`.
 */
export async function listarCambios(db: DbOTx, opciones: { antesDe?: number; todo?: boolean; limite?: number } = {}) {
  const condiciones = [];
  if (!opciones.todo) condiciones.push(inArray(auditoria.accion, ["anular", "modificar"]));
  if (opciones.antesDe) condiciones.push(lt(auditoria.id, opciones.antesDe));
  const filas = await db
    .select({
      id: auditoria.id,
      fecha: auditoria.fecha,
      tabla: auditoria.tabla,
      registro_id: auditoria.registro_id,
      accion: auditoria.accion,
      motivo: auditoria.motivo,
      antes: auditoria.antes,
      despues: auditoria.despues,
      usuario: usuario.email,
    })
    .from(auditoria)
    .leftJoin(usuario, eq(usuario.id, auditoria.usuario_id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(auditoria.id))
    .limit(opciones.limite ?? 50);
  return filas.map((f) => ({ ...f, fecha: f.fecha.toISOString() }));
}
