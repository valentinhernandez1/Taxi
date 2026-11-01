/**
 * Avisos al celular (Web Push): apagados sin claves, suscripción, firma VAPID
 * verificable, envío (con el servicio de push simulado) y los avisos de hoy.
 */
import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { hoy } from "../src/servicios/comun";
import { avisoDiario, avisosDeHoy, enviarPush, firmarVapid, suscribir } from "../src/servicios/push";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const b64u = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function clavesDePrueba() {
  const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publica = (await crypto.subtle.exportKey("raw", par.publicKey)) as ArrayBuffer;
  const privada = (await crypto.subtle.exportKey("jwk", par.privateKey)) as JsonWebKey;
  const conClaves: Env = { ...(env as Env), VAPID_PUBLICA: b64u(publica), VAPID_PRIVADA: privada.d!, VAPID_CONTACTO: "mailto:dueno@ejemplo.uy" };
  return { conClaves, publicKey: par.publicKey };
}

const ENDPOINT = "https://push.ejemplo.invalid/suscripcion/abc";

describe("avisos al celular", () => {
  it("sin claves están apagados: no hay clave pública y el aviso diario no hace nada", async () => {
    expect((await pedir("/push/clave", { cookie })).cuerpo).toEqual({ clave: null });
    expect(await conBase((db) => avisoDiario(db, env as Env))).toEqual({ enviados: 0, desactivados: 0, avisos: 0 });
    expect((await pedir("/push/probar", { metodo: "POST", cuerpo: {}, cookie })).estado).toBe(400);
  });

  it("se suscribe un celular (y suscribirse dos veces no duplica)", async () => {
    const cuerpo = { endpoint: ENDPOINT, keys: { p256dh: "BPclaveDePruebaDeEjemplo", auth: "autenticacion1" } };
    expect((await pedir("/push/suscribir", { metodo: "POST", cuerpo, cookie })).estado).toBe(200);
    expect((await pedir("/push/suscribir", { metodo: "POST", cuerpo, cookie })).estado).toBe(200);
    const n = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from push_suscripcion where activa`));
    expect(n[0]!.n).toBe(1);
    await pedir("/push/desuscribir", { metodo: "POST", cuerpo: { endpoint: ENDPOINT }, cookie });
    const m = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from push_suscripcion where activa`));
    expect(m[0]!.n).toBe(0);
    expect((await pedir("/push/suscribir", { metodo: "POST", cuerpo: { ...cuerpo, endpoint: "http://inseguro.invalid/x" }, cookie })).estado).toBe(400);
  });

  it("la firma VAPID se verifica con la clave pública", async () => {
    const { conClaves, publicKey } = await clavesDePrueba();
    const jwt = await firmarVapid(ENDPOINT, conClaves, Date.UTC(2026, 9, 12));
    const [cabecera, cuerpo, firma] = jwt.split(".");
    const desde = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(t.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
    expect(JSON.parse(new TextDecoder().decode(desde(cuerpo!)))).toMatchObject({ aud: "https://push.ejemplo.invalid", sub: "mailto:dueno@ejemplo.uy" });
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, desde(firma!), new TextEncoder().encode(`${cabecera}.${cuerpo}`));
    expect(ok).toBe(true);
  });

  it("manda un push vacío a cada celular y desactiva los que el servicio dio de baja", async () => {
    const { conClaves } = await clavesDePrueba();
    await conBase(async (db) => {
      await suscribir(db, { endpoint: ENDPOINT, p256dh: "p256dh-de-ejemplo", auth: "auth-de-ejemplo" });
      await suscribir(db, { endpoint: "https://push.ejemplo.invalid/vencida", p256dh: "p256dh-de-ejemplo", auth: "auth-de-ejemplo" });
    });
    const pedidos: { url: string; init: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      pedidos.push({ url: String(url), init: init! });
      return new Response(null, { status: String(url).endsWith("vencida") ? 410 : 201 });
    });
    const r = await conBase((db) => enviarPush(db, conClaves));
    expect(r).toEqual({ enviados: 1, desactivados: 1 });
    expect(pedidos).toHaveLength(2);
    const cabeceras = pedidos[0]!.init.headers as Record<string, string>;
    expect(cabeceras.authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(pedidos[0]!.init.body).toBeUndefined();
  });

  it("los avisos de hoy: vencimientos y días sin cargar; sin nada, no se manda push", async () => {
    const { conClaves } = await clavesDePrueba();
    const espia = vi.spyOn(globalThis, "fetch");
    expect(await conBase((db) => avisoDiario(db, conClaves))).toMatchObject({ avisos: 0, enviados: 0 });
    expect(espia).not.toHaveBeenCalled();

    const cat = (await pedir("/categorias", { cookie })).cuerpo.categorias.find((c: { nombre: string }) => c.nombre === "BPS").id;
    const dia = hoy();
    await pedir("/gastos-fijos", {
      metodo: "POST",
      cuerpo: { categoria_id: cat, descripcion: "Aporte BPS", importe: 450000, frecuencia: "mensual", dia_del_mes: Number(dia.slice(8, 10)), primer_periodo: dia.slice(0, 7) },
      cookie,
    });
    const avisos = await conBase((db) => avisosDeHoy(db));
    expect(avisos).toContain("Aporte BPS: vence hoy.");
    expect((await pedir("/push/avisos", { cookie })).cuerpo.avisos).toContain("Aporte BPS: vence hoy.");
  });
});
