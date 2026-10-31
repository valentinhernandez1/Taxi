/**
 * Sesiones en la base: la cookie lleva un token al azar de 256 bits y la tabla
 * guarda solo su SHA-256, así que una copia filtrada no sirve para entrar.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Db } from "../db/cliente";
import { sesion, usuario } from "../db/schema";
import type { AppEnv, UsuarioActual } from "../env";

export const NOMBRE_COOKIE = "sesion";
export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;
/** Solo se renueva la expiración una vez por día, para no escribir en cada pedido. */
const RENOVAR_CADA_MS = 24 * 60 * 60 * 1000;

function aHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
  return aHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

function tokenNuevo(): string {
  return aHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function crearSesion(db: Db, usuarioId: number): Promise<{ token: string; hash: string; expira: Date }> {
  const token = tokenNuevo();
  const hash = await hashToken(token);
  const expira = new Date(Date.now() + DURACION_SESION_MS);
  await db.insert(sesion).values({ id_hash: hash, usuario_id: usuarioId, expira_en: expira });
  // Limpieza oportunista de sesiones vencidas del mismo usuario.
  await db.delete(sesion).where(and(eq(sesion.usuario_id, usuarioId), lt(sesion.expira_en, new Date())));
  return { token, hash, expira };
}

export async function buscarSesion(db: Db, token: string): Promise<{ usuario: UsuarioActual; hash: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await hashToken(token);
  const [fila] = await db
    .select({
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      ultimoUso: sesion.ultimo_uso,
    })
    .from(sesion)
    .innerJoin(usuario, eq(usuario.id, sesion.usuario_id))
    .where(and(eq(sesion.id_hash, hash), gt(sesion.expira_en, new Date()), eq(usuario.activo, true)))
    .limit(1);
  if (!fila) return null;

  if (Date.now() - fila.ultimoUso.getTime() > RENOVAR_CADA_MS) {
    await db
      .update(sesion)
      .set({ ultimo_uso: sql`now()`, expira_en: new Date(Date.now() + DURACION_SESION_MS) })
      .where(eq(sesion.id_hash, hash));
  }
  return { usuario: { id: fila.id, email: fila.email, rol: fila.rol }, hash };
}

export async function cerrarSesion(db: Db, hash: string): Promise<void> {
  await db.delete(sesion).where(eq(sesion.id_hash, hash));
}

export async function cerrarOtrasSesiones(db: Db, usuarioId: number, excepto: string): Promise<void> {
  await db.delete(sesion).where(and(eq(sesion.usuario_id, usuarioId), sql`${sesion.id_hash} <> ${excepto}`));
}

export function ponerCookie(c: Context<AppEnv>, token: string, expira: Date): void {
  setCookie(c, NOMBRE_COOKIE, token, {
    httpOnly: true,
    secure: c.env.ENTORNO !== "development",
    sameSite: "Strict",
    path: "/",
    expires: expira,
  });
}

export function leerCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, NOMBRE_COOKIE);
}

export function borrarCookie(c: Context<AppEnv>): void {
  deleteCookie(c, NOMBRE_COOKIE, { path: "/", secure: c.env.ENTORNO !== "development" });
}
