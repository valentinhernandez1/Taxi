/** Panel del inicio, Ganancia, Dónde ganar más, llamadas perdidas y exportación. */
import { esPeriodo, sumarMeses } from "@taxis/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { listarCambios } from "../servicios/auditoria";
import { esquemaDia, esquemaId, hoy } from "../servicios/comun";
import { exportar, QUE_SE_EXPORTA } from "../servicios/exportar";
import { anotarLlamada, gananciaDelMes, listarLlamadas, marcarSugerencia, panel, sugerenciasDelMes } from "../servicios/panel";

const esquemaPeriodo = z.string().refine(esPeriodo, "El mes no es válido");
/** Por defecto, el último mes completo. */
const mesPedido = (valor: string | undefined) => esquemaPeriodo.parse(valor ?? sumarMeses(hoy().slice(0, 7), -1));

export const rutasPanel = new Hono<AppEnv>();
rutasPanel.use(requiereSesion, soloDueno);

rutasPanel.get("/", async (c) => c.json(await panel(c.var.db)));
rutasPanel.get("/ganancia", async (c) => c.json(await gananciaDelMes(c.var.db, mesPedido(c.req.query("mes")))));
rutasPanel.get("/sugerencias", async (c) => c.json(await sugerenciasDelMes(c.var.db, mesPedido(c.req.query("mes")))));

rutasPanel.post("/sugerencias/estado", async (c) => {
  const datos = z
    .object({ clave: z.string().trim().min(1).max(60), periodo: esquemaPeriodo, estado: z.enum(["hecha", "descartada"]).nullable() })
    .parse(await c.req.json());
  return c.json(await marcarSugerencia(c.var.db, datos.clave, datos.periodo, datos.estado));
});

/** Historial de cambios (anulaciones y correcciones; con ?todo=1, todo). */
rutasPanel.get("/cambios", async (c) => {
  const antes = c.req.query("antes");
  return c.json({
    cambios: await listarCambios(c.var.db, { antesDe: antes ? esquemaId.parse(antes) : undefined, todo: c.req.query("todo") === "1" }),
  });
});

rutasPanel.get("/llamadas", async (c) => c.json({ llamadas: await listarLlamadas(c.var.db) }));

rutasPanel.post("/llamadas", async (c) => {
  const datos = z
    .object({ fecha: esquemaDia, hora: z.string().nullish(), nota: z.string().trim().max(200).nullish() })
    .parse(await c.req.json());
  return c.json(await anotarLlamada(c.var.db, datos), 201);
});

rutasPanel.get("/exportar/:que", async (c) => {
  const que = z.enum(QUE_SE_EXPORTA, { error: "No se puede exportar eso" }).parse(c.req.param("que").replace(/\.csv$/, ""));
  const hasta = esquemaDia.parse(c.req.query("hasta") ?? hoy());
  const desde = esquemaDia.parse(c.req.query("desde") ?? `${hasta.slice(0, 7)}-01`);
  const texto = await exportar(c.var.db, que, desde, hasta);
  return c.body(texto, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${que}-${desde}-a-${hasta}.csv"`,
  });
});
