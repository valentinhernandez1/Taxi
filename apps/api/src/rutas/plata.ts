/** Dónde está la plata: saldos, entregas y acreditaciones de Handy. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaDia, esquemaId, esquemaImporte, esquemaImporteOCero, esquemaOpKey } from "../servicios/comun";
import { acreditarHandy, recibirEntrega, resumenPlata } from "../servicios/plata";

export const rutasPlata = new Hono<AppEnv>();
rutasPlata.use(requiereSesion, soloDueno);

rutasPlata.get("/", async (c) => c.json(await resumenPlata(c.var.db)));

rutasPlata.post("/entregas", async (c) => {
  const datos = z
    .object({
      op_key: esquemaOpKey,
      persona_id: esquemaId,
      fecha: esquemaDia,
      entregado: esquemaImporteOCero,
      nota: z.string().trim().max(300).nullish(),
    })
    .parse(await c.req.json());
  const resultado = await recibirEntrega(c.var.db, c.var.usuario.id, datos);
  return c.json(resultado, resultado.repetido ? 200 : 201);
});

rutasPlata.post("/handy", async (c) => {
  const datos = z
    .object({ op_key: esquemaOpKey, fecha: esquemaDia, importe_acreditado: esquemaImporte })
    .parse(await c.req.json());
  const resultado = await acreditarHandy(c.var.db, c.var.usuario.id, datos);
  return c.json(resultado, resultado.repetido ? 200 : 201);
});
