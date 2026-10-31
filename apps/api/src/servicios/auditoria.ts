/**
 * La auditoría se escribe desde los servicios, dentro de la misma transacción
 * que el cambio, para guardar el motivo (especificación §5). La tabla no admite
 * UPDATE ni DELETE (migración 0001).
 */
import { and, desc, eq } from "drizzle-orm";
import type { DbOTx } from "../db/cliente";
import { auditoria } from "../db/schema";

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
