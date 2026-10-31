import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ErrorNegocio } from "../errores";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaId, esquemaMotivo, esquemaOpKey } from "../servicios/comun";
import {
  anularComprobante,
  leerComprobante,
  MAXIMO_BYTES,
  subirComprobante,
  type TablaConComprobante,
} from "../servicios/comprobantes";

export const rutasComprobantes = new Hono<AppEnv>();
rutasComprobantes.use(requiereSesion, soloDueno);

/** Subir una foto: el cuerpo es la imagen tal cual (image/jpeg, image/png o image/webp). */
rutasComprobantes.post("/:tabla{cobro|gasto}/:id{[0-9]+}", async (c) => {
  const tabla = c.req.param("tabla");
  const largo = Number(c.req.header("content-length") ?? 0);
  if (largo > MAXIMO_BYTES) throw new ErrorNegocio("La foto es demasiado grande (máximo 5 MB).");
  const resultado = await subirComprobante(c.var.db, c.env, c.var.usuario.id, {
    tabla: tabla as TablaConComprobante,
    registroId: esquemaId.parse(c.req.param("id")),
    opKey: esquemaOpKey.parse(c.req.query("op_key")),
    bytes: new Uint8Array(await c.req.arrayBuffer()),
  });
  const { id, tabla: t, registro_id, ancho, alto, bytes, clave_miniatura } = resultado.comprobante;
  return c.json(
    { comprobante: { id, tabla: t, registro_id, ancho, alto, bytes, miniatura: clave_miniatura !== null }, repetido: resultado.repetido },
    resultado.repetido ? 200 : 201,
  );
});

rutasComprobantes.get("/:id{[0-9]+}/:variante", async (c) => {
  const variante = z.enum(["foto", "miniatura"]).parse(c.req.param("variante"));
  const { cuerpo, tipo } = await leerComprobante(c.var.db, c.env, esquemaId.parse(c.req.param("id")), variante);
  return new Response(cuerpo, {
    headers: { "content-type": tipo, "content-disposition": "inline", "x-content-type-options": "nosniff" },
  });
});

rutasComprobantes.post("/:id{[0-9]+}/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularComprobante(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});
