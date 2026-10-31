import {
  AJUSTES,
  ajustesPorDefecto,
  CLAVES_AJUSTES,
  type ClaveAjuste,
  validarCoherenciaAjustes,
  type ValoresAjustes,
} from "@taxis/shared";
import { sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { ajuste } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";

/** Ajustes guardados encima de los valores por defecto. Un valor guardado que ya no valida se ignora. */
export async function leerAjustes(db: DbOTx): Promise<ValoresAjustes> {
  const valores = ajustesPorDefecto() as Record<ClaveAjuste, unknown>;
  for (const fila of await db.select().from(ajuste)) {
    if (!(CLAVES_AJUSTES as string[]).includes(fila.clave)) continue;
    const clave = fila.clave as ClaveAjuste;
    const leido = AJUSTES[clave].esquema.safeParse(fila.valor);
    if (leido.success) valores[clave] = leido.data;
  }
  return valores as ValoresAjustes;
}

export async function cambiarAjuste(
  db: Db,
  usuarioId: number,
  clave: ClaveAjuste,
  valorNuevo: unknown,
  motivo?: string,
): Promise<ValoresAjustes> {
  const leido = AJUSTES[clave].esquema.safeParse(valorNuevo);
  if (!leido.success) {
    throw new ErrorNegocio(leido.error.issues[0]?.message ?? "Valor inválido");
  }

  return db.transaction(async (tx) => {
    // Bloquea la fila (o la tabla si todavía no existe) para que dos cambios no se pisen.
    await tx.execute(sql`lock table ${ajuste} in share row exclusive mode`);
    const actuales = await leerAjustes(tx);
    const antes = actuales[clave];
    const nuevos = { ...actuales, [clave]: leido.data } as ValoresAjustes;

    const incoherencia = validarCoherenciaAjustes(nuevos);
    if (incoherencia) throw new ErrorNegocio(incoherencia);
    if (JSON.stringify(antes) === JSON.stringify(leido.data)) return actuales;

    await tx
      .insert(ajuste)
      .values({ clave, valor: leido.data })
      .onConflictDoUpdate({ target: ajuste.clave, set: { valor: leido.data, actualizado_en: sql`now()` } });
    await registrarAuditoria(tx, {
      tabla: "ajuste",
      registroId: clave,
      accion: "modificar",
      antes,
      despues: leido.data,
      motivo: motivo ?? null,
      usuarioId,
    });
    return nuevos;
  });
}
