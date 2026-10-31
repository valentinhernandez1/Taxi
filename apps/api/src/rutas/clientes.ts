import { centesimos } from "@taxis/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { requiereSesion, soloDueno } from "../middleware";
import { cargarHoja } from "../servicios/carga-inicial";
import {
  crearCliente,
  editarCliente,
  fichaCliente,
  listarClientes,
  registrarRecordatorio,
} from "../servicios/clientes";
import { esquemaDia, esquemaId, esquemaImporte, esquemaOpKey } from "../servicios/comun";

export const rutasClientes = new Hono<AppEnv>();
rutasClientes.use(requiereSesion, soloDueno);

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((t) => (t ? t : null));

const esquemaDatos = z.object({
  nombre: z.string().trim().min(1, "Escribí el nombre").max(80),
  telefono: textoOpcional(30),
  observaciones: textoOpcional(500),
  plazo_dias: z.number().int().min(1).max(3650).nullish().transform((n) => n ?? null),
  limite_fiado: esquemaImporte.nullish().transform((n) => n ?? null),
});

rutasClientes.get("/", async (c) => {
  const buscar = c.req.query("buscar");
  const soloDeudores = c.req.query("deben") === "1";
  return c.json(await listarClientes(c.var.db, { buscar, soloDeudores }));
});

rutasClientes.post("/", async (c) => {
  const datos = esquemaDatos.parse(await c.req.json());
  return c.json({ cliente: await crearCliente(c.var.db, c.var.usuario.id, datos) }, 201);
});

rutasClientes.get("/:id", async (c) => {
  return c.json(await fichaCliente(c.var.db, esquemaId.parse(c.req.param("id"))));
});

rutasClientes.put("/:id", async (c) => {
  const cuerpo = await c.req.json();
  const cambios = esquemaDatos.partial().extend({ activo: z.boolean().optional() }).parse(cuerpo);
  const motivo = z.string().trim().max(300).optional().parse(cuerpo?.motivo);
  const cliente = await editarCliente(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), cambios, motivo);
  return c.json({ cliente });
});

rutasClientes.post("/:id/recordatorio", async (c) => {
  return c.json(await registrarRecordatorio(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id"))));
});

const esquemaHoja = z.object({
  op_key: esquemaOpKey,
  renglones: z
    .array(
      z.object({
        fecha: esquemaDia,
        importe: esquemaImporte,
        chofer_id: esquemaId.nullish(),
        nota: z.string().trim().max(200).nullish(),
      }),
    )
    .max(500),
  pagos: z.array(z.object({ fecha: esquemaDia, importe: esquemaImporte })).max(500),
  total_hoja: z.number().int().min(0).transform((n) => centesimos(n)),
});

rutasClientes.post("/:id/carga-inicial", async (c) => {
  const hoja = esquemaHoja.parse(await c.req.json());
  const resultado = await cargarHoja(c.var.db, c.var.usuario.id, esquemaId.parse(c.req.param("id")), hoja);
  return c.json(resultado, resultado.repetido ? 200 : 201);
});
