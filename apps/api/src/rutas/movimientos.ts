/** Fiados y cobros: anotar y anular. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { anotarCobro, anularCobro } from "../servicios/cobros";
import { esquemaDia, esquemaId, esquemaImporte, esquemaMotivo, esquemaOpKey, hoy } from "../servicios/comun";
import { anotarFiado, anularFiado } from "../servicios/fiados";

export const rutasFiados = new Hono<AppEnv>();
rutasFiados.use(requiereSesion, soloDueno);

const esquemaFiado = z.object({
  op_key: esquemaOpKey,
  cliente_id: esquemaId,
  fecha: esquemaDia,
  importe: esquemaImporte,
  chofer_id: esquemaId.nullish(),
  coche_id: esquemaId.nullish(),
  confirmar_limite: z.boolean().optional(),
});

rutasFiados.post("/", async (c) => {
  const resultado = await anotarFiado(c.var.db, c.var.usuario.id, esquemaFiado.parse(await c.req.json()));
  return c.json(resultado, resultado.repetido ? 200 : 201);
});

rutasFiados.post("/:id/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularFiado(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});

export const rutasCobros = new Hono<AppEnv>();
rutasCobros.use(requiereSesion, soloDueno);

const esquemaCobro = z.object({
  op_key: esquemaOpKey,
  cliente_id: esquemaId,
  fecha: esquemaDia,
  importe: esquemaImporte,
  medio: z.enum(["efectivo", "transferencia"], { error: "Elegí cómo pagó" }),
  recibido_por_id: esquemaId.nullish(),
  confirmar_a_favor: z.boolean().optional(),
});

rutasCobros.post("/", async (c) => {
  const resultado = await anotarCobro(c.var.db, c.var.usuario.id, esquemaCobro.parse(await c.req.json()));
  return c.json(resultado, resultado.repetido ? 200 : 201);
});

rutasCobros.post("/:id/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularCobro(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo, hoy()));
});
