/** Viajes del día (efectivo, tarjeta o fiado) y días sin cargar. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaDia, esquemaId, esquemaImporte, esquemaMotivo, esquemaOpKey, hoy } from "../servicios/comun";
import { anotarViaje, anularViaje, cobertura, marcarSinTrabajo, viajesDelDia } from "../servicios/viajes";

export const rutasViajes = new Hono<AppEnv>();
rutasViajes.use(requiereSesion, soloDueno);

const esquemaViaje = z.object({
  op_key: esquemaOpKey,
  fecha: esquemaDia,
  importe: esquemaImporte,
  forma_pago: z.enum(["efectivo", "tarjeta", "fiado"], { error: "Elegí cómo pagó" }),
  chofer_id: esquemaId.nullish(),
  coche_id: esquemaId.nullish(),
  cliente_id: esquemaId.nullish(),
  confirmar_limite: z.boolean().optional(),
});

rutasViajes.post("/", async (c) => {
  const resultado = await anotarViaje(c.var.db, c.var.usuario.id, esquemaViaje.parse(await c.req.json()));
  return c.json(resultado, resultado.repetido ? 200 : 201);
});

rutasViajes.get("/", async (c) => c.json(await viajesDelDia(c.var.db, esquemaDia.parse(c.req.query("fecha") ?? hoy()))));

/** Días sin cargar de un período (regla 9). Por defecto, los últimos 30 días. */
rutasViajes.get("/dias", async (c) => {
  const hasta = esquemaDia.parse(c.req.query("hasta") ?? hoy());
  const desde = esquemaDia.parse(c.req.query("desde") ?? hasta);
  return c.json(await cobertura(c.var.db, desde, hasta, c.req.query("desde_el_primero") === "1"));
});

rutasViajes.post("/sin-trabajo", async (c) => {
  const { fecha, nota } = z
    .object({ fecha: esquemaDia, nota: z.string().trim().max(200).nullish() })
    .parse(await c.req.json());
  return c.json(await marcarSinTrabajo(c.var.db, c.var.usuario.id, fecha, nota || null));
});

rutasViajes.post("/:id{[0-9]+}/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularViaje(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});
