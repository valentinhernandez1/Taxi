/** Choferes, sus reglas de pago y la liquidación al terminar cada turno. */
import { centesimos } from "@taxis/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ErrorNegocio } from "../errores";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaDia, esquemaId, esquemaImporte, esquemaImporteOCero, esquemaMotivo, esquemaOpKey, hoy } from "../servicios/comun";
import {
  anularLiquidacion,
  confirmarRegla,
  cuentaDelTurno,
  guardarRegla,
  liquidacionesDe,
  liquidar,
  listarChoferes,
  pendienteFiadosB,
  reglasDe,
} from "../servicios/liquidacion";

export const rutasChoferes = new Hono<AppEnv>();
rutasChoferes.use(requiereSesion, soloDueno);

rutasChoferes.get("/", async (c) => c.json({ choferes: await listarChoferes(c.var.db) }));

rutasChoferes.get("/:id{[0-9]+}", async (c) => {
  const id = esquemaId.parse(c.req.param("id"));
  const chofer = (await listarChoferes(c.var.db)).find((x) => x.id === id);
  if (!chofer) throw new ErrorNegocio("Ese chofer no existe o está dado de baja", 404);
  return c.json({
    chofer,
    reglas: await reglasDe(c.var.db, id),
    liquidaciones: await liquidacionesDe(c.var.db, id),
    pendiente_fiados: await pendienteFiadosB(c.var.db, id),
  });
});

export const rutasReglas = new Hono<AppEnv>();
rutasReglas.use(requiereSesion, soloDueno);

rutasReglas.post("/", async (c) => {
  const datos = z
    .object({
      chofer_id: esquemaId,
      tipo: z.enum(["porcentaje", "jornal", "sueldo", "mixto"], { error: "Elegí cómo cobra" }),
      porcentaje_puntos: z.number().int().min(0).max(10_000, "El porcentaje va de 0 a 100").nullish(),
      jornal: esquemaImporte.nullish(),
      modo_entrega: z.enum(["entrega_todo", "se_queda_su_parte"], { error: "Elegí cómo entrega" }),
      momento_fiado: z.enum(["A", "B"], { error: "Elegí cuándo cobra su parte de los fiados" }),
      incobrable: z.enum(["empresa", "chofer"]).default("empresa"),
      vigente_desde: esquemaDia,
    })
    .parse(await c.req.json());
  return c.json({ regla: await guardarRegla(c.var.db, c.var.usuario.id, datos) }, 201);
});

rutasReglas.post("/:id{[0-9]+}/confirmar", async (c) =>
  c.json({ regla: await confirmarRegla(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id"))) }),
);

export const rutasLiquidaciones = new Hono<AppEnv>();
rutasLiquidaciones.use(requiereSesion, soloDueno);

/** La cuenta del turno sin guardar nada, para mostrarla en el asistente. */
rutasLiquidaciones.get("/cuenta", async (c) => {
  const choferId = esquemaId.parse(c.req.query("chofer_id"));
  const fecha = esquemaDia.parse(c.req.query("fecha") ?? hoy());
  const gastos = c.req.query("gastos") ? esquemaImporteOCero.parse(Number(c.req.query("gastos"))) : centesimos(0);
  return c.json(await cuentaDelTurno(c.var.db, choferId, fecha, gastos));
});

rutasLiquidaciones.post("/", async (c) => {
  const datos = z
    .object({
      op_key: esquemaOpKey,
      chofer_id: esquemaId,
      fecha: esquemaDia,
      gasto: z.object({ categoria_id: esquemaId, importe: esquemaImporte }).nullish(),
      entregado: esquemaImporteOCero.nullish(),
      nota: z.string().trim().max(300).nullish(),
      pagado_con: z.object({ desde: z.enum(["caja", "banco", "persona"]), persona_id: esquemaId.nullish() }).nullish(),
    })
    .parse(await c.req.json());
  const r = await liquidar(c.var.db, c.var.usuario.id, datos);
  return c.json(r, r.repetido ? 200 : 201);
});

rutasLiquidaciones.post("/:id{[0-9]+}/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularLiquidacion(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});
