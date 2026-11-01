/** Turnos: horarios, grilla semanal, cambio de chofer y repetir la semana. */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaDia, esquemaId, hoy } from "../servicios/comun";
import { asignar, guardarPlantilla, listarPlantillas, repetirSemanaAnterior, semana, turnosDelDia } from "../servicios/turnos";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora no es válida");

export const rutasTurnos = new Hono<AppEnv>();
rutasTurnos.use(requiereSesion, soloDueno);

rutasTurnos.get("/semana", async (c) => c.json(await semana(c.var.db, esquemaDia.parse(c.req.query("dia") ?? hoy()))));

rutasTurnos.get("/dia", async (c) => c.json({ turnos: await turnosDelDia(c.var.db, esquemaDia.parse(c.req.query("fecha") ?? hoy())) }));

rutasTurnos.put("/", async (c) => {
  const datos = z
    .object({ fecha: esquemaDia, coche_id: esquemaId, plantilla_id: esquemaId, chofer_id: esquemaId.nullable() })
    .parse(await c.req.json());
  return c.json({ turno: await asignar(c.var.db, c.var.usuario.id, datos) });
});

rutasTurnos.post("/repetir", async (c) => {
  const { dia } = z.object({ dia: esquemaDia }).parse(await c.req.json());
  return c.json(await repetirSemanaAnterior(c.var.db, c.var.usuario.id, dia));
});

rutasTurnos.get("/horarios", async (c) => c.json({ horarios: await listarPlantillas(c.var.db, c.req.query("todos") === "1") }));

const nombre = z.string().trim().min(1, "Escribí el nombre").max(30);

rutasTurnos.post("/horarios", async (c) => {
  const datos = z.object({ nombre, hora_inicio: hora, hora_fin: hora }).parse(await c.req.json());
  return c.json({ horario: await guardarPlantilla(c.var.db, c.var.usuario.id, null, datos) }, 201);
});

rutasTurnos.put("/horarios/:id{[0-9]+}", async (c) => {
  const datos = z
    .object({ nombre: nombre.optional(), hora_inicio: hora.optional(), hora_fin: hora.optional(), activa: z.boolean().optional() })
    .parse(await c.req.json());
  return c.json({ horario: await guardarPlantilla(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), datos) });
});
