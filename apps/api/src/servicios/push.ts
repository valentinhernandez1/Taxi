/**
 * Avisos al celular (Web Push, especificación §4 "Avisos"; gratis).
 *
 * Se manda un push SIN contenido (no hace falta cifrar nada): el service
 * worker del celular lo recibe, pide los avisos de hoy a /api/push/avisos con
 * la sesión del dueño y muestra la notificación. Así no viaja ningún dato por
 * el servicio de push.
 *
 * Queda apagado hasta que estén las claves VAPID (VAPID_PUBLICA,
 * VAPID_PRIVADA, VAPID_CONTACTO); ver docs/despliegue.md.
 */
import { formatearDiaLargo, sumarDias } from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { pushSuscripcion } from "../db/schema";
import type { Env } from "../env";
import { ErrorNegocio } from "../errores";
import { leerAjustes } from "./ajustes";
import { hoy } from "./comun";
import { listarVencimientos } from "./gastos";
import { panel } from "./panel";
import { cobertura } from "./viajes";

function aBase64Url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function pushConfigurado(env: Env): boolean {
  return Boolean(env.VAPID_PUBLICA && env.VAPID_PRIVADA && env.VAPID_CONTACTO);
}

/** La clave privada VAPID (32 bytes) como clave de firma ES256, armada con la pública (65 bytes, sin comprimir). */
async function claveDeFirma(publica: string, privada: string): Promise<CryptoKey> {
  const p = deBase64Url(publica);
  if (p.length !== 65 || p[0] !== 4) throw new Error("VAPID_PUBLICA no es una clave P-256 sin comprimir");
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: aBase64Url(p.slice(1, 33)), y: aBase64Url(p.slice(33, 65)), d: privada, ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** JWT de VAPID (RFC 8292) para el servicio de push de ese endpoint, válido 12 horas. */
export async function firmarVapid(endpoint: string, env: Env, ahora = Date.now()): Promise<string> {
  const texto = (o: unknown) => aBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const cuerpo = `${texto({ typ: "JWT", alg: "ES256" })}.${texto({
    aud: new URL(endpoint).origin,
    exp: Math.floor(ahora / 1000) + 12 * 3600,
    sub: env.VAPID_CONTACTO,
  })}`;
  const clave = await claveDeFirma(env.VAPID_PUBLICA!, env.VAPID_PRIVADA!);
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${aBase64Url(new Uint8Array(firma))}`;
}

/** Un push vacío: solo despierta al service worker del celular. */
export async function pedidoPush(endpoint: string, env: Env): Promise<{ url: string; init: RequestInit }> {
  return {
    url: endpoint,
    init: {
      method: "POST",
      headers: {
        authorization: `vapid t=${await firmarVapid(endpoint, env)}, k=${env.VAPID_PUBLICA}`,
        ttl: String(24 * 3600),
        urgency: "normal",
        "content-length": "0",
      },
    },
  };
}

// ---------------------------------------------------------------- Suscripciones

export async function suscribir(db: Db, datos: { endpoint: string; p256dh: string; auth: string }) {
  await db
    .insert(pushSuscripcion)
    .values(datos)
    .onConflictDoUpdate({ target: pushSuscripcion.endpoint, set: { p256dh: datos.p256dh, auth: datos.auth, activa: true } });
  return { ok: true };
}

export async function desuscribir(db: Db, endpoint: string) {
  await db.update(pushSuscripcion).set({ activa: false }).where(eq(pushSuscripcion.endpoint, endpoint));
  return { ok: true };
}

// ---------------------------------------------------------------- Qué avisar

/**
 * Los avisos de hoy (especificación §4 "Avisos"): vencimientos (3 días antes y
 * el mismo día, o lo configurado), días sin cargar, plata sin entregar y
 * clientes en rojo.
 */
export async function avisosDeHoy(db: Db): Promise<string[]> {
  const dia = hoy();
  const avisos: string[] = [];
  for (const v of (await listarVencimientos(db)).filter((x) => x.avisar)) {
    avisos.push(
      v.vencido
        ? `${v.descripcion}: venció hace ${-v.dias} ${v.dias === -1 ? "día" : "días"}.`
        : v.dias === 0
          ? `${v.descripcion}: vence hoy.`
          : `${v.descripcion}: vence el ${formatearDiaLargo(v.fecha_vence).toLowerCase()}.`,
    );
  }
  const semana = await cobertura(db, sumarDias(dia, -7), sumarDias(dia, -1), true);
  if (semana.diasSinCargar.length) {
    avisos.push(
      semana.diasSinCargar.length === 1
        ? `Falta anotar los viajes del ${formatearDiaLargo(semana.diasSinCargar[0]!).toLowerCase()}.`
        : `Faltan anotar ${semana.diasSinCargar.length} días de la última semana.`,
    );
  }
  for (const p of (await panel(db)).sin_rendir) avisos.push(`${p.nombre} tiene plata sin entregar desde el ${formatearDiaLargo(p.desde).toLowerCase()}.`);
  const dias = (await leerAjustes(db)).alerta_roja_dias;
  const [rojo] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from saldo_cliente where debe > 0 and mas_viejo_pendiente < (${dia}::date - ${dias}::int)`);
  if (rojo?.n) avisos.push(rojo.n === 1 ? `1 cliente debe hace más de ${dias} días.` : `${rojo.n} clientes deben hace más de ${dias} días.`);
  return avisos;
}

/**
 * Manda el push a cada celular suscripto. Los que el servicio da por
 * vencidos (404 o 410) se desactivan. Devuelve a cuántos llegó.
 */
export async function enviarPush(db: Db, env: Env): Promise<{ enviados: number; desactivados: number }> {
  if (!pushConfigurado(env)) throw new ErrorNegocio("Los avisos al celular todavía no están configurados (faltan las claves VAPID).");
  const subs = await db.select().from(pushSuscripcion).where(eq(pushSuscripcion.activa, true));
  let enviados = 0;
  let desactivados = 0;
  for (const s of subs) {
    const { url, init } = await pedidoPush(s.endpoint, env);
    const r = await fetch(url, init);
    if (r.status === 404 || r.status === 410) {
      await db.update(pushSuscripcion).set({ activa: false }).where(and(eq(pushSuscripcion.id, s.id)));
      desactivados++;
    } else if (r.ok) {
      await db.update(pushSuscripcion).set({ ultimo_envio: new Date() }).where(eq(pushSuscripcion.id, s.id));
      enviados++;
    }
  }
  return { enviados, desactivados };
}

/** Lo que corre una vez por día (cron del Worker): si hay algo para avisar, despierta a los celulares. */
export async function avisoDiario(db: Db, env: Env) {
  if (!pushConfigurado(env)) return { enviados: 0, desactivados: 0, avisos: 0 };
  const avisos = await avisosDeHoy(db);
  if (avisos.length === 0) return { enviados: 0, desactivados: 0, avisos: 0 };
  return { ...(await enviarPush(db, env)), avisos: avisos.length };
}
