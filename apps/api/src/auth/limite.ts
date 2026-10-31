/**
 * Límite de intentos de login, guardado en Postgres (sin servicios extra).
 * Cuenta los fallos recientes por email y por IP; un login correcto no borra
 * el historial, pero los fallos viejos dejan de contar al salir de la ventana.
 */
import { and, count, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { intentoLogin } from "../db/schema";

export const VENTANA_MS = 15 * 60 * 1000;
export const MAXIMO_FALLOS_POR_EMAIL = 5;
export const MAXIMO_FALLOS_POR_IP = 20;
const RETENCION_MS = 30 * 24 * 60 * 60 * 1000;

export async function estaBloqueado(db: Db, email: string, ip: string): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_MS);
  const fallos = (condicion: ReturnType<typeof eq>) =>
    db
      .select({ n: count() })
      .from(intentoLogin)
      .where(and(condicion, eq(intentoLogin.exito, false), gt(intentoLogin.fecha, desde)));
  const [[porEmail], [porIp]] = await Promise.all([fallos(eq(intentoLogin.email, email)), fallos(eq(intentoLogin.ip, ip))]);
  return (porEmail?.n ?? 0) >= MAXIMO_FALLOS_POR_EMAIL || (porIp?.n ?? 0) >= MAXIMO_FALLOS_POR_IP;
}

export async function registrarIntento(db: Db, email: string, ip: string, exito: boolean): Promise<void> {
  await db.insert(intentoLogin).values({ email, ip, exito });
  if (exito) {
    await db.delete(intentoLogin).where(lt(intentoLogin.fecha, new Date(Date.now() - RETENCION_MS)));
  }
}
