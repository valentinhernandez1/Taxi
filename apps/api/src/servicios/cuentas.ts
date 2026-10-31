/**
 * La plata como movimientos entre cuentas (especificación §5). Los saldos de
 * cada lugar salen de sumar movimientos; un movimiento confirmado no se borra:
 * se revierte con otro inverso.
 */
import { aNumeric, type Centesimos, type Dia } from "@taxis/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbOTx } from "../db/cliente";
import { cuenta, movimiento, persona } from "../db/schema";
import { ErrorNegocio } from "../errores";

type CuentaBase = "caja" | "banco" | "handy" | "externo";

export async function cuentaBase(tx: DbOTx, tipo: CuentaBase): Promise<number> {
  const [fila] = await tx
    .select({ id: cuenta.id })
    .from(cuenta)
    .where(and(eq(cuenta.tipo, tipo), isNull(cuenta.persona_id)));
  if (!fila) throw new Error(`Falta la cuenta base "${tipo}" (migración 0003)`);
  return fila.id;
}

/** Lo que tiene una persona y le tiene que entregar al dueño. Se crea la primera vez. */
export async function cuentaAEntregar(tx: DbOTx, personaId: number): Promise<number> {
  const [existente] = await tx
    .select({ id: cuenta.id })
    .from(cuenta)
    .where(and(eq(cuenta.tipo, "a_entregar"), eq(cuenta.persona_id, personaId)));
  if (existente) return existente.id;
  const [p] = await tx.select({ nombre: persona.nombre }).from(persona).where(eq(persona.id, personaId));
  if (!p) throw new ErrorNegocio("Esa persona no existe", 404);
  const [nueva] = await tx
    .insert(cuenta)
    .values({ tipo: "a_entregar", persona_id: personaId, nombre: `Tiene ${p.nombre}` })
    .onConflictDoNothing()
    .returning({ id: cuenta.id });
  if (nueva) return nueva.id;
  return cuentaAEntregar(tx, personaId);
}

export interface NuevoMovimiento {
  fecha: Dia;
  importe: Centesimos;
  desde: number;
  hacia: number;
  tipo: string;
  origenTabla: string;
  origenId: number;
  opKey: string;
}

export async function registrarMovimiento(tx: DbOTx, m: NuevoMovimiento): Promise<void> {
  await tx.insert(movimiento).values({
    fecha: m.fecha,
    importe: aNumeric(m.importe),
    cuenta_desde: m.desde,
    cuenta_hacia: m.hacia,
    tipo: m.tipo,
    origen_tabla: m.origenTabla,
    origen_id: m.origenId,
    op_key: m.opKey,
  });
}

/**
 * Anulación: por cada movimiento vigente del registro, uno inverso que lo
 * cancela, con la fecha de la anulación. El original queda como estaba.
 */
export async function revertirMovimientos(tx: DbOTx, origenTabla: string, origenId: number, fecha: Dia): Promise<void> {
  const vigentes = await tx
    .select()
    .from(movimiento)
    .where(
      and(
        eq(movimiento.origen_tabla, origenTabla),
        eq(movimiento.origen_id, origenId),
        isNull(movimiento.revierte_id),
        sql`not exists (select 1 from ${movimiento} m2 where m2.revierte_id = ${movimiento.id})`,
      ),
    );
  for (const m of vigentes) {
    await tx.insert(movimiento).values({
      fecha,
      importe: m.importe,
      cuenta_desde: m.cuenta_hacia,
      cuenta_hacia: m.cuenta_desde,
      tipo: `anula_${m.tipo}`,
      origen_tabla: origenTabla,
      origen_id: origenId,
      revierte_id: m.id,
      op_key: `${m.op_key}:anulado`,
    });
  }
}
