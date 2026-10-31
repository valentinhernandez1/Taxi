/**
 * Cobros de fiados. El pago baja el saldo pero no cambia el importe de los
 * viajes (regla 2); se imputa a lo más viejo (regla 4) y nunca vuelve a sumar
 * facturación (regla 3). Mueve plata: de "afuera" a la caja, al banco o a lo
 * que tiene que entregar quien lo recibió (caso 7).
 */
import { aNumeric, type Centesimos, type Dia, desdeNumeric, formatearImporte, imputarFIFO } from "@taxis/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { cobro, imputacion, persona, viaje } from "../db/schema";
import { ErrorNegocio, pedirConfirmacion } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { bloquearCliente, deudasDe, resumenCliente } from "./clientes";
import { validarDia } from "./comun";
import { cuentaAEntregar, cuentaBase, registrarMovimiento, revertirMovimientos } from "./cuentas";
import { esDuplicado, validarPersona } from "./fiados";

export interface NuevoCobro {
  op_key: string;
  cliente_id: number;
  fecha: Dia;
  importe: Centesimos;
  medio: "efectivo" | "transferencia";
  /** Quién recibió el efectivo. Vacío = el dueño. */
  recibido_por_id?: number | null;
  /** Pagó más de lo que debe y el dueño confirmó dejarlo a favor (caso 4). */
  confirmar_a_favor?: boolean;
}

async function resultado(db: Db, cobroId: number, clienteId: number, repetido: boolean) {
  const aplicado = await db
    .select({ viaje_id: imputacion.viaje_id, fecha: viaje.fecha, importe: imputacion.importe })
    .from(imputacion)
    .innerJoin(viaje, eq(viaje.id, imputacion.viaje_id))
    .where(eq(imputacion.cobro_id, cobroId))
    .orderBy(asc(viaje.fecha), asc(viaje.id));
  return {
    cobro_id: cobroId,
    repetido,
    aplicado: aplicado.map((a) => ({ ...a, importe: desdeNumeric(a.importe) })),
    cliente: await resumenCliente(db, clienteId),
  };
}

/** Adónde va la plata de un cobro. */
async function destinoDeLaPlata(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], datos: NuevoCobro) {
  if (datos.medio === "transferencia") return { cuenta: await cuentaBase(tx, "banco"), tipo: "cobro_transferencia" };
  if (datos.recibido_por_id == null) return { cuenta: await cuentaBase(tx, "caja"), tipo: "cobro_efectivo" };
  const [p] = await tx.select({ tipo: persona.tipo }).from(persona).where(eq(persona.id, datos.recibido_por_id));
  if (p?.tipo === "dueno") return { cuenta: await cuentaBase(tx, "caja"), tipo: "cobro_efectivo" };
  return { cuenta: await cuentaAEntregar(tx, datos.recibido_por_id), tipo: "cobro_efectivo" };
}

export async function anotarCobro(db: Db, usuarioId: number, datos: NuevoCobro) {
  validarDia(datos.fecha);
  if (datos.medio === "transferencia" && datos.recibido_por_id != null) {
    throw new ErrorNegocio("Una transferencia va directo al banco: no la recibe nadie en mano");
  }
  const [existente] = await db.select({ id: cobro.id }).from(cobro).where(eq(cobro.op_key, datos.op_key));
  if (existente) return resultado(db, existente.id, datos.cliente_id, true);

  try {
    const cobroId = await db.transaction(async (tx) => {
      const datosCliente = await bloquearCliente(tx, datos.cliente_id);
      await validarPersona(tx, datos.recibido_por_id, "La persona que recibió");

      const deudas = await deudasDe(tx, datos.cliente_id);
      const { imputaciones, sobrante } = imputarFIFO(deudas, datos.importe);
      if (sobrante > 0 && !datos.confirmar_a_favor) {
        const debe = (datos.importe - sobrante) as Centesimos;
        throw pedirConfirmacion(
          "a_favor",
          `Es más de lo que debe. ${datosCliente.nombre} debe ${formatearImporte(debe, { sinDecimales: true })}. ` +
            `Si pagó de más, quedan ${formatearImporte(sobrante, { sinDecimales: true })} a su favor.`,
          { debe, sobrante },
        );
      }

      const [nuevo] = await tx
        .insert(cobro)
        .values({
          cliente_id: datos.cliente_id,
          fecha: datos.fecha,
          importe: aNumeric(datos.importe),
          medio: datos.medio,
          recibido_por_id: datos.medio === "efectivo" ? (datos.recibido_por_id ?? null) : null,
          op_key: datos.op_key,
        })
        .returning({ id: cobro.id });
      const id = nuevo!.id;
      if (imputaciones.length) {
        await tx
          .insert(imputacion)
          .values(imputaciones.map((i) => ({ cobro_id: id, viaje_id: i.viajeId, importe: aNumeric(i.importe) })));
      }

      const destino = await destinoDeLaPlata(tx, datos);
      await registrarMovimiento(tx, {
        fecha: datos.fecha,
        importe: datos.importe,
        desde: await cuentaBase(tx, "externo"),
        hacia: destino.cuenta,
        tipo: destino.tipo,
        origenTabla: "cobro",
        origenId: id,
        opKey: `${datos.op_key}:mov`,
      });

      await registrarAuditoria(tx, {
        tabla: "cobro",
        registroId: id,
        accion: "crear",
        despues: {
          ...datos,
          importe: aNumeric(datos.importe),
          imputaciones: imputaciones.map((i) => ({ viaje_id: i.viajeId, importe: aNumeric(i.importe) })),
          a_favor: aNumeric(sobrante),
        },
        motivo: sobrante > 0 ? "Pagó de más; el dueño confirmó dejarlo a favor" : null,
        usuarioId,
      });
      return id;
    });
    return resultado(db, cobroId, datos.cliente_id, false);
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [ya] = await db.select({ id: cobro.id }).from(cobro).where(eq(cobro.op_key, datos.op_key));
    return resultado(db, ya!.id, datos.cliente_id, true);
  }
}

/**
 * Caso 14: el saldo vuelve a como estaba, el cobro queda visible como anulado,
 * la plata se revierte con un movimiento inverso y la auditoría guarda el motivo.
 */
export async function anularCobro(db: Db, usuarioId: number, cobroId: number, motivo: string, fecha: Dia) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(cobro).where(eq(cobro.id, cobroId));
    if (!c) throw new ErrorNegocio("Ese cobro no existe", 404);
    await bloquearCliente(tx, c.cliente_id);
    if (c.anulado) return { cliente_id: c.cliente_id };
    await tx.update(cobro).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(cobro.id, cobroId));
    await revertirMovimientos(tx, "cobro", cobroId, fecha);
    const aplicado = await tx
      .select({ viaje_id: imputacion.viaje_id, importe: imputacion.importe })
      .from(imputacion)
      .where(inArray(imputacion.cobro_id, [cobroId]));
    await registrarAuditoria(tx, {
      tabla: "cobro",
      registroId: cobroId,
      accion: "anular",
      antes: { anulado: false, importe: c.importe, fecha: c.fecha, medio: c.medio, aplicado },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
    return { cliente_id: c.cliente_id };
  });
}
