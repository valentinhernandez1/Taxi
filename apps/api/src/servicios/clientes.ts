import {
  aNumeric,
  type Centesimos,
  type DeudaViaje,
  desdeNumeric,
  diasEntre,
  enlaceWhatsApp,
  mensajeRecordatorio,
  nivelDeAlerta,
  type NivelAlerta,
  telefonoWhatsApp,
} from "@taxis/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { cliente, cobro, coche, imputacion, persona, viaje } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { leerAjustes } from "./ajustes";
import { registrarAuditoria } from "./auditoria";
import { hoy } from "./comun";

export interface DatosCliente {
  nombre: string;
  telefono: string | null;
  observaciones: string | null;
  plazo_dias: number | null;
  limite_fiado: Centesimos | null;
}

export interface ResumenCliente {
  id: number;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  limite_fiado: Centesimos | null;
  plazo_dias: number | null;
  debe: Centesimos;
  a_favor: Centesimos;
  antiguedad_dias: number | null;
  nivel: NivelAlerta;
}

const columnasResumen = {
  id: cliente.id,
  nombre: cliente.nombre,
  telefono: cliente.telefono,
  activo: cliente.activo,
  limite_fiado: cliente.limite_fiado,
  plazo_dias: cliente.plazo_dias,
  debe: sql<string>`s.debe`,
  a_favor: sql<string>`s.a_favor`,
  mas_viejo: sql<string | null>`s.mas_viejo_pendiente::text`,
};

interface FilaResumen {
  id: number;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  limite_fiado: string | null;
  plazo_dias: number | null;
  debe: string;
  a_favor: string;
  mas_viejo: string | null;
}

function aResumen(fila: FilaResumen, umbrales: { amarilla: number; roja: number }, dia = hoy()): ResumenCliente {
  const antiguedad = fila.mas_viejo ? Math.max(0, diasEntre(fila.mas_viejo, dia)) : null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    activo: fila.activo,
    limite_fiado: fila.limite_fiado === null ? null : desdeNumeric(fila.limite_fiado),
    plazo_dias: fila.plazo_dias,
    debe: desdeNumeric(fila.debe),
    a_favor: desdeNumeric(fila.a_favor),
    antiguedad_dias: antiguedad,
    nivel: nivelDeAlerta(antiguedad, umbrales, fila.plazo_dias),
  };
}

async function umbrales(db: DbOTx) {
  const ajustes = await leerAjustes(db);
  return { amarilla: ajustes.alerta_amarilla_dias, roja: ajustes.alerta_roja_dias };
}

/**
 * Lista de clientes con su saldo. `soloDeudores` es la pantalla "Quién debe":
 * ordenada por antigüedad (lo más viejo arriba) y después por importe.
 */
export async function listarClientes(
  db: DbOTx,
  opciones: { buscar?: string; soloDeudores?: boolean; incluirInactivos?: boolean } = {},
): Promise<{ clientes: ResumenCliente[]; total_debe: Centesimos }> {
  const condiciones = [];
  if (!opciones.incluirInactivos) condiciones.push(eq(cliente.activo, true));
  if (opciones.buscar?.trim()) {
    const patron = `%${opciones.buscar.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    condiciones.push(sql`lower(${cliente.nombre}) like ${patron}`);
  }
  if (opciones.soloDeudores) condiciones.push(sql`s.debe > 0`);

  const filas = (await db
    .select(columnasResumen)
    .from(cliente)
    .innerJoin(sql`saldo_cliente s`, sql`s.cliente_id = ${cliente.id}`)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(
      opciones.soloDeudores ? sql`s.mas_viejo_pendiente asc nulls last` : asc(sql`lower(${cliente.nombre})`),
      desc(sql`s.debe`),
      asc(cliente.id),
    )) as FilaResumen[];

  const u = await umbrales(db);
  const clientes = filas.map((f) => aResumen(f, u));
  const total = clientes.reduce((suma, c) => suma + c.debe, 0) as Centesimos;
  return { clientes, total_debe: total };
}

export async function resumenCliente(db: DbOTx, id: number): Promise<ResumenCliente> {
  const [fila] = (await db
    .select(columnasResumen)
    .from(cliente)
    .innerJoin(sql`saldo_cliente s`, sql`s.cliente_id = ${cliente.id}`)
    .where(eq(cliente.id, id))) as FilaResumen[];
  if (!fila) throw new ErrorNegocio("Ese cliente no existe", 404);
  return aResumen(fila, await umbrales(db));
}

/** Deudas pendientes del cliente, viaje por viaje (para imputar FIFO). */
export async function deudasDe(db: DbOTx, clienteId: number): Promise<DeudaViaje[]> {
  const filas = await db.execute<{ viaje_id: string; fecha: string; pendiente: string }>(
    sql`select viaje_id, fecha::text as fecha, pendiente::text as pendiente
        from fiado_pendiente where cliente_id = ${clienteId} and pendiente > 0
        order by fecha, viaje_id`,
  );
  return filas.map((f) => ({ viajeId: Number(f.viaje_id), fecha: f.fecha, pendiente: desdeNumeric(f.pendiente) }));
}

/** Bloquea al cliente hasta el fin de la transacción: dos cobros a la vez no se pisan. */
export async function bloquearCliente(tx: DbOTx, clienteId: number) {
  const [fila] = await tx.select().from(cliente).where(eq(cliente.id, clienteId)).for("update");
  if (!fila) throw new ErrorNegocio("Ese cliente no existe", 404);
  return fila;
}

export interface MovimientoFicha {
  tipo: "fiado" | "cobro";
  id: number;
  fecha: string;
  importe: Centesimos;
  origen: "normal" | "carga_inicial";
  anulado: boolean;
  motivo_anulacion: string | null;
  // Fiado
  chofer?: string | null;
  coche?: string | null;
  nota?: string | null;
  pagado?: Centesimos;
  pendiente?: Centesimos;
  // Cobro
  medio?: "efectivo" | "transferencia" | null;
  recibido_por?: string | null;
  aplicado?: { viaje_id: number; fecha: string; importe: Centesimos }[];
  a_favor?: Centesimos;
}

/** Ficha del cliente: datos, saldo y la historia de viajes fiados y pagos (más nuevo arriba). */
export async function fichaCliente(db: DbOTx, id: number) {
  const resumen = await resumenCliente(db, id);
  const [datos] = await db.select().from(cliente).where(eq(cliente.id, id));

  const fiados = await db
    .select({
      id: viaje.id,
      fecha: viaje.fecha,
      importe: viaje.importe,
      origen: viaje.origen,
      anulado: viaje.anulado,
      motivo_anulacion: viaje.motivo_anulacion,
      nota: viaje.nota,
      chofer: persona.nombre,
      coche: coche.nombre_movil,
      creado_en: viaje.creado_en,
    })
    .from(viaje)
    .leftJoin(persona, eq(persona.id, viaje.chofer_id))
    .leftJoin(coche, eq(coche.id, viaje.coche_id))
    .where(and(eq(viaje.cliente_id, id), eq(viaje.forma_pago, "fiado")));

  const cobros = await db
    .select({
      id: cobro.id,
      fecha: cobro.fecha,
      importe: cobro.importe,
      origen: cobro.origen,
      medio: cobro.medio,
      anulado: cobro.anulado,
      motivo_anulacion: cobro.motivo_anulacion,
      nota: cobro.nota,
      recibido_por: persona.nombre,
      creado_en: cobro.creado_en,
    })
    .from(cobro)
    .leftJoin(persona, eq(persona.id, cobro.recibido_por_id))
    .where(eq(cobro.cliente_id, id));

  const imputaciones = cobros.length
    ? await db
        .select({ cobro_id: imputacion.cobro_id, viaje_id: imputacion.viaje_id, importe: imputacion.importe, fecha: viaje.fecha })
        .from(imputacion)
        .innerJoin(viaje, eq(viaje.id, imputacion.viaje_id))
        .where(inArray(imputacion.cobro_id, cobros.map((c) => c.id)))
        .orderBy(asc(viaje.fecha), asc(viaje.id))
    : [];
  const anulados = new Set(cobros.filter((c) => c.anulado).map((c) => c.id));

  const pagadoPorViaje = new Map<number, number>();
  for (const i of imputaciones) {
    if (anulados.has(i.cobro_id)) continue;
    pagadoPorViaje.set(i.viaje_id, (pagadoPorViaje.get(i.viaje_id) ?? 0) + desdeNumeric(i.importe));
  }

  const historial: (MovimientoFicha & { creado: number })[] = [
    ...fiados.map((f) => {
      const importe = desdeNumeric(f.importe);
      const pagado = (f.anulado ? 0 : (pagadoPorViaje.get(f.id) ?? 0)) as Centesimos;
      return {
        tipo: "fiado" as const,
        id: f.id,
        fecha: f.fecha,
        importe,
        origen: f.origen,
        anulado: f.anulado,
        motivo_anulacion: f.motivo_anulacion,
        chofer: f.chofer,
        coche: f.coche,
        nota: f.nota,
        pagado,
        pendiente: (f.anulado ? 0 : importe - pagado) as Centesimos,
        creado: f.creado_en.getTime(),
      };
    }),
    ...cobros.map((c) => {
      const aplicado = imputaciones
        .filter((i) => i.cobro_id === c.id)
        .map((i) => ({ viaje_id: i.viaje_id, fecha: i.fecha, importe: desdeNumeric(i.importe) }));
      const importe = desdeNumeric(c.importe);
      return {
        tipo: "cobro" as const,
        id: c.id,
        fecha: c.fecha,
        importe,
        origen: c.origen,
        anulado: c.anulado,
        motivo_anulacion: c.motivo_anulacion,
        medio: c.medio,
        recibido_por: c.recibido_por,
        nota: c.nota,
        aplicado,
        a_favor: (c.anulado ? 0 : importe - aplicado.reduce((s, a) => s + a.importe, 0)) as Centesimos,
        creado: c.creado_en.getTime(),
      };
    }),
  ].sort((a, b) => (a.fecha === b.fecha ? b.creado - a.creado : a.fecha < b.fecha ? 1 : -1));

  return {
    cliente: {
      ...resumen,
      observaciones: datos!.observaciones,
      ultimo_recordatorio: datos!.ultimo_recordatorio,
    },
    historial: historial.map(({ creado: _creado, ...resto }) => resto),
  };
}

function aFila(d: DatosCliente) {
  return {
    nombre: d.nombre,
    telefono: d.telefono,
    observaciones: d.observaciones,
    plazo_dias: d.plazo_dias,
    limite_fiado: d.limite_fiado === null ? null : aNumeric(d.limite_fiado),
  };
}

async function nombreRepetido(db: DbOTx, nombre: string, excepto?: number): Promise<boolean> {
  const filas = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(sql`lower(${cliente.nombre}) = ${nombre.trim().toLowerCase()}`, eq(cliente.activo, true)));
  return filas.some((f) => f.id !== excepto);
}

export async function crearCliente(db: Db, usuarioId: number, datos: DatosCliente): Promise<ResumenCliente> {
  if (await nombreRepetido(db, datos.nombre)) {
    throw new ErrorNegocio("Ya hay un cliente con ese nombre. Agregale algo para distinguirlos (por ejemplo, el barrio).", 409);
  }
  const id = await db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(cliente).values(aFila(datos)).returning({ id: cliente.id });
    await registrarAuditoria(tx, { tabla: "cliente", registroId: nuevo!.id, accion: "crear", despues: datos, usuarioId });
    return nuevo!.id;
  });
  return resumenCliente(db, id);
}

export async function editarCliente(
  db: Db,
  usuarioId: number,
  id: number,
  cambios: Partial<DatosCliente> & { activo?: boolean },
  motivo?: string,
): Promise<ResumenCliente> {
  if (cambios.nombre && (await nombreRepetido(db, cambios.nombre, id))) {
    throw new ErrorNegocio("Ya hay un cliente con ese nombre.", 409);
  }
  await db.transaction(async (tx) => {
    const antes = await bloquearCliente(tx, id);
    const valores: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === undefined) continue;
      valores[clave] = clave === "limite_fiado" && valor !== null ? aNumeric(valor as Centesimos) : valor;
    }
    if (Object.keys(valores).length === 0) return;
    if (valores.activo === false) {
      const [s] = await tx.execute<{ debe: string }>(sql`select debe::text from saldo_cliente where cliente_id = ${id}`);
      if (s && desdeNumeric(s.debe) > 0) throw new ErrorNegocio("No se puede dar de baja a un cliente que todavía debe.");
    }
    await tx.update(cliente).set(valores).where(eq(cliente.id, id));
    const antesVisible = Object.fromEntries(Object.keys(valores).map((k) => [k, antes[k as keyof typeof antes]]));
    await registrarAuditoria(tx, {
      tabla: "cliente",
      registroId: id,
      accion: "modificar",
      antes: antesVisible,
      despues: valores,
      motivo: motivo ?? null,
      usuarioId,
    });
  });
  return resumenCliente(db, id);
}

/** Arma el mensaje de WhatsApp y anota la fecha del recordatorio (lo manda el dueño). */
export async function registrarRecordatorio(db: Db, usuarioId: number, id: number) {
  const resumen = await resumenCliente(db, id);
  const numero = telefonoWhatsApp(resumen.telefono);
  if (!numero) throw new ErrorNegocio("El cliente no tiene un teléfono de Uruguay anotado. Agregalo en sus datos.");
  if (resumen.debe <= 0) throw new ErrorNegocio("El cliente no debe nada.");
  const ajustes = await leerAjustes(db);
  const mensaje = mensajeRecordatorio({
    cliente: resumen.nombre,
    empresa: ajustes.nombre_empresa,
    debe: resumen.debe,
    moneda: ajustes.moneda,
  });
  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx.update(cliente).set({ ultimo_recordatorio: ahora }).where(eq(cliente.id, id));
    await registrarAuditoria(tx, {
      tabla: "cliente",
      registroId: id,
      accion: "modificar",
      despues: { ultimo_recordatorio: ahora.toISOString(), debe: aNumeric(resumen.debe) },
      motivo: "Recordatorio por WhatsApp",
      usuarioId,
    });
  });
  return { enlace: enlaceWhatsApp(numero, mensaje), mensaje, ultimo_recordatorio: ahora };
}
