/** Personas y coches. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaId } from "../servicios/comun";
import { crearCoche, crearPersona, editarCoche, editarPersona, listarCoches, listarPersonas } from "../servicios/flota";

const nombre = z.string().trim().min(1, "Escribí el nombre").max(60);
const opcional = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((t) => (t ? t : null));

export const rutasPersonas = new Hono<AppEnv>();
rutasPersonas.use(requiereSesion, soloDueno);

rutasPersonas.get("/", async (c) => c.json({ personas: await listarPersonas(c.var.db, c.req.query("todas") === "1") }));

rutasPersonas.post("/", async (c) => {
  const datos = z
    .object({ nombre, telefono: opcional, tipo: z.enum(["chofer", "telefonista", "otro"], { error: "Elegí qué hace" }) })
    .parse(await c.req.json());
  return c.json({ persona: await crearPersona(c.var.db, c.var.usuario.id, datos) }, 201);
});

rutasPersonas.put("/:id", async (c) => {
  const cambios = z.object({ nombre: nombre.optional(), telefono: opcional.optional(), activo: z.boolean().optional() }).parse(await c.req.json());
  return c.json({ persona: await editarPersona(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), cambios) });
});

export const rutasCoches = new Hono<AppEnv>();
rutasCoches.use(requiereSesion, soloDueno);

rutasCoches.get("/", async (c) => c.json({ coches: await listarCoches(c.var.db, c.req.query("todos") === "1") }));

rutasCoches.post("/", async (c) => {
  const datos = z.object({ nombre_movil: nombre, matricula: opcional }).parse(await c.req.json());
  return c.json({ coche: await crearCoche(c.var.db, c.var.usuario.id, datos) }, 201);
});

rutasCoches.put("/:id", async (c) => {
  const cambios = z
    .object({ nombre_movil: nombre.optional(), matricula: opcional.optional(), activo: z.boolean().optional() })
    .parse(await c.req.json());
  return c.json({ coche: await editarCoche(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), cambios) });
});
