import { esClaveAjuste, esquemaCambioAjuste } from "@taxis/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ErrorNegocio } from "../errores";
import { requiereSesion, soloDueno } from "../middleware";
import { cambiarAjuste, leerAjustes } from "../servicios/ajustes";
import { historialDe } from "../servicios/auditoria";

export const rutasAjustes = new Hono<AppEnv>();

rutasAjustes.use(requiereSesion, soloDueno);

rutasAjustes.get("/", async (c) => c.json({ ajustes: await leerAjustes(c.var.db) }));

rutasAjustes.put("/:clave", async (c) => {
  const clave = c.req.param("clave");
  if (!esClaveAjuste(clave)) throw new ErrorNegocio("Ese ajuste no existe", 404);
  const { valor, motivo } = esquemaCambioAjuste.parse(await c.req.json());
  const ajustes = await cambiarAjuste(c.var.db, c.var.usuario.id, clave, valor, motivo);
  return c.json({ ajustes });
});

rutasAjustes.get("/:clave/historial", async (c) => {
  const clave = c.req.param("clave");
  if (!esClaveAjuste(clave)) throw new ErrorNegocio("Ese ajuste no existe", 404);
  return c.json({ historial: await historialDe(c.var.db, "ajuste", clave) });
});
