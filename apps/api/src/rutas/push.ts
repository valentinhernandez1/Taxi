/** Avisos al celular (Web Push): clave pública, suscribirse, probar y los avisos de hoy. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { avisosDeHoy, desuscribir, enviarPush, pushConfigurado, suscribir } from "../servicios/push";

export const rutasPush = new Hono<AppEnv>();
rutasPush.use(requiereSesion, soloDueno);

/** Nula si los avisos todavía no están configurados. */
rutasPush.get("/clave", (c) => c.json({ clave: pushConfigurado(c.env) ? c.env.VAPID_PUBLICA : null }));

const url = z.string().url().max(1000).refine((u) => u.startsWith("https://"), "La dirección del aviso no es válida");

rutasPush.post("/suscribir", async (c) => {
  const datos = z
    .object({ endpoint: url, keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }) })
    .parse(await c.req.json());
  return c.json(await suscribir(c.var.db, { endpoint: datos.endpoint, p256dh: datos.keys.p256dh, auth: datos.keys.auth }));
});

rutasPush.post("/desuscribir", async (c) => {
  const { endpoint } = z.object({ endpoint: url }).parse(await c.req.json());
  return c.json(await desuscribir(c.var.db, endpoint));
});

rutasPush.post("/probar", async (c) => c.json(await enviarPush(c.var.db, c.env)));

/** Lo que muestra la notificación (lo pide el service worker al recibir el push). */
rutasPush.get("/avisos", async (c) => c.json({ avisos: await avisosDeHoy(c.var.db) }));
