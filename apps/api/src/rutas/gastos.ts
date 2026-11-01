/** Gastos, categorías, gastos fijos con sus vencimientos, pagos a empleados y ficha de coche. */
import { esPeriodo } from "@taxis/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { esquemaDia, esquemaId, esquemaImporte, esquemaMotivo, esquemaOpKey, hoy } from "../servicios/comun";
import { anotarPagoEmpleado, anularPagoEmpleado, resumenEmpleados } from "../servicios/empleados";
import {
  anotarGasto,
  anularGasto,
  fichaDeCoche,
  gastosDelMes,
  guardarCategoria,
  guardarGastoFijo,
  listarCategorias,
  listarGastosFijos,
  listarVencimientos,
  omitirVencimiento,
  pagarGasto,
  pagarVencimiento,
  posponerVencimiento,
} from "../servicios/gastos";

const esquemaPeriodo = z.string().refine(esPeriodo, "El mes no es válido");
const periodoDeLaConsulta = (valor: string | undefined) => esquemaPeriodo.parse(valor ?? hoy().slice(0, 7));

/** ¿Con qué plata? Caja, banco o la plata que tiene una persona (por ejemplo, la recaudación de un chofer). */
const esquemaConQuePlata = z.object(
  { desde: z.enum(["caja", "banco", "persona"], { error: "Elegí con qué plata" }), persona_id: esquemaId.nullish() },
  { error: "Elegí con qué plata" },
);

// ---------------------------------------------------------------- Gastos

export const rutasGastos = new Hono<AppEnv>();
rutasGastos.use(requiereSesion, soloDueno);

rutasGastos.get("/", async (c) => c.json(await gastosDelMes(c.var.db, periodoDeLaConsulta(c.req.query("mes")))));

rutasGastos.post("/", async (c) => {
  const datos = z
    .object({
      op_key: esquemaOpKey,
      fecha: esquemaDia,
      importe: esquemaImporte,
      categoria_id: esquemaId,
      coche_id: esquemaId.nullish(),
      descripcion: z.string().trim().max(200).nullish(),
      pagado_con: esquemaConQuePlata.nullish(),
    })
    .parse(await c.req.json());
  const r = await anotarGasto(c.var.db, c.var.usuario.id, datos);
  return c.json(r, r.repetido ? 200 : 201);
});

rutasGastos.post("/:id{[0-9]+}/pagar", async (c) => {
  const datos = z.object({ fecha: esquemaDia, pagado_con: esquemaConQuePlata }).parse(await c.req.json());
  return c.json(await pagarGasto(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), datos));
});

rutasGastos.post("/:id{[0-9]+}/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularGasto(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});

// ---------------------------------------------------------------- Categorías

export const rutasCategorias = new Hono<AppEnv>();
rutasCategorias.use(requiereSesion, soloDueno);

const nombreCategoria = z.string().trim().min(1, "Escribí el nombre").max(40);

rutasCategorias.get("/", async (c) => c.json({ categorias: await listarCategorias(c.var.db) }));

rutasCategorias.post("/", async (c) => {
  const datos = z
    .object({ nombre: nombreCategoria, es_de_coche: z.boolean().optional(), es_cuota_vehiculo: z.boolean().optional() })
    .parse(await c.req.json());
  return c.json({ categoria: await guardarCategoria(c.var.db, c.var.usuario.id, null, datos) }, 201);
});

rutasCategorias.put("/:id{[0-9]+}", async (c) => {
  const datos = z
    .object({
      nombre: nombreCategoria.optional(),
      es_de_coche: z.boolean().optional(),
      es_cuota_vehiculo: z.boolean().optional(),
      activa: z.boolean().optional(),
    })
    .parse(await c.req.json());
  return c.json({ categoria: await guardarCategoria(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), datos) });
});

// ---------------------------------------------------------------- Gastos fijos y vencimientos

export const rutasGastosFijos = new Hono<AppEnv>();
rutasGastosFijos.use(requiereSesion, soloDueno);

const esquemaGastoFijo = z.object({
  categoria_id: esquemaId,
  coche_id: esquemaId.nullish(),
  descripcion: z.string().trim().min(1, "Escribí qué es").max(80),
  importe: esquemaImporte.nullish(),
  importe_estimado: z.boolean().optional(),
  frecuencia: z.enum(["mensual", "bimestral", "anual", "meses_especificos"], { error: "Elegí cada cuánto vence" }),
  meses: z.array(z.number().int().min(1).max(12)).max(12).nullish(),
  dia_del_mes: z.number({ error: "Elegí el día" }).int().min(1, "El día va de 1 a 31").max(31, "El día va de 1 a 31"),
  primer_periodo: esquemaPeriodo,
  cuotas_total: z.number().int().positive().max(600).nullish(),
  fecha_fin: esquemaDia.nullish(),
  dias_aviso: z.array(z.number().int().min(0).max(60)).max(5).optional(),
  activo: z.boolean().optional(),
});

rutasGastosFijos.get("/", async (c) => c.json({ gastos_fijos: await listarGastosFijos(c.var.db) }));

rutasGastosFijos.post("/", async (c) => {
  const datos = esquemaGastoFijo.parse(await c.req.json());
  return c.json({ gasto_fijo: await guardarGastoFijo(c.var.db, c.var.usuario.id, null, datos) }, 201);
});

rutasGastosFijos.put("/:id{[0-9]+}", async (c) => {
  const datos = esquemaGastoFijo.parse(await c.req.json());
  return c.json({ gasto_fijo: await guardarGastoFijo(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), datos) });
});

export const rutasVencimientos = new Hono<AppEnv>();
rutasVencimientos.use(requiereSesion, soloDueno);

rutasVencimientos.get("/", async (c) => c.json({ vencimientos: await listarVencimientos(c.var.db) }));

rutasVencimientos.post("/:id{[0-9]+}/pagar", async (c) => {
  const datos = z
    .object({ op_key: esquemaOpKey, fecha: esquemaDia, importe: esquemaImporte, pagado_con: esquemaConQuePlata })
    .parse(await c.req.json());
  const r = await pagarVencimiento(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), datos);
  return c.json(r, r.repetido ? 200 : 201);
});

rutasVencimientos.post("/:id{[0-9]+}/manana", async (c) => c.json(await posponerVencimiento(c.var.db, esquemaId.parse(c.req.param("id")))));

rutasVencimientos.post("/:id{[0-9]+}/omitir", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await omitirVencimiento(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});

// ---------------------------------------------------------------- Pagos a empleados

export const rutasEmpleados = new Hono<AppEnv>();
rutasEmpleados.use(requiereSesion, soloDueno);

rutasEmpleados.get("/", async (c) => c.json(await resumenEmpleados(c.var.db, periodoDeLaConsulta(c.req.query("mes")))));

rutasEmpleados.post("/pagos", async (c) => {
  const datos = z
    .object({
      op_key: esquemaOpKey,
      persona_id: esquemaId,
      concepto: z.enum(["sueldo", "jornal", "adelanto", "aguinaldo", "salario_vacacional"], { error: "Elegí qué le pagás" }),
      periodo: esquemaPeriodo,
      importe: esquemaImporte,
      fecha: esquemaDia,
      pagado_con: esquemaConQuePlata,
    })
    .parse(await c.req.json());
  const r = await anotarPagoEmpleado(c.var.db, c.var.usuario.id, datos);
  return c.json(r, r.repetido ? 200 : 201);
});

rutasEmpleados.post("/pagos/:id{[0-9]+}/anular", async (c) => {
  const { motivo } = z.object({ motivo: esquemaMotivo }).parse(await c.req.json());
  return c.json(await anularPagoEmpleado(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), motivo));
});

// ---------------------------------------------------------------- Ficha de coche

export const rutasFichaCoche = new Hono<AppEnv>();
rutasFichaCoche.use(requiereSesion, soloDueno);

rutasFichaCoche.get("/:id{[0-9]+}", async (c) =>
  c.json(await fichaDeCoche(c.var.db, esquemaId.parse(c.req.param("id")), periodoDeLaConsulta(c.req.query("mes")))),
);
