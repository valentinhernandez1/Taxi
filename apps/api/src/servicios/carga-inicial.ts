/**
 * Carga inicial de las hojas de fiados de papel (flujo 7). Los renglones entran
 * como viajes de origen "carga_inicial": suman a la deuda pero no a la
 * facturación del mes ni a las liquidaciones (caso 15). Los pagos anotados en
 * la hoja son plata vieja: bajan la deuda pero no mueven ninguna cuenta de hoy.
 */
import { aNumeric, type Centesimos, type Dia, formatearImporte, imputarFIFO, totalDeLaHoja } from "@taxis/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { cobro, imputacion, viaje } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { bloquearCliente, deudasDe, resumenCliente } from "./clientes";
import { validarDia } from "./comun";
import { esDuplicado, validarPersona } from "./fiados";

export interface HojaDePapel {
  op_key: string;
  renglones: { fecha: Dia; importe: Centesimos; chofer_id?: number | null; nota?: string | null }[];
  pagos: { fecha: Dia; importe: Centesimos }[];
  /** Lo que dice la hoja que debe: tiene que coincidir con renglones − pagos. */
  total_hoja: Centesimos;
}

const $ = (c: Centesimos) => formatearImporte(c, { sinDecimales: true });

export async function cargarHoja(db: Db, usuarioId: number, clienteId: number, hoja: HojaDePapel) {
  if (hoja.renglones.length === 0) throw new ErrorNegocio("Anotá al menos un viaje de la hoja");
  for (const r of [...hoja.renglones, ...hoja.pagos]) validarDia(r.fecha);

  const total = totalDeLaHoja(hoja.renglones, hoja.pagos);
  if (total < 0) throw new ErrorNegocio("Los pagos suman más que los viajes. Revisá la hoja.");
  if (total !== hoja.total_hoja) {
    throw new ErrorNegocio(
      `No coincide con la hoja: los viajes menos los pagos dan ${$(total)} y la hoja dice ${$(hoja.total_hoja)}. ` +
        `Hay una diferencia de ${$(Math.abs(total - hoja.total_hoja) as Centesimos)}.`,
      400,
      { calculado: total },
    );
  }

  const [ya] = await db.select({ id: viaje.id }).from(viaje).where(eq(viaje.op_key, `${hoja.op_key}:v0`));
  if (ya) return { repetido: true, cliente: await resumenCliente(db, clienteId) };

  try {
    await db.transaction(async (tx) => {
      const datosCliente = await bloquearCliente(tx, clienteId);
      if (!datosCliente.activo) throw new ErrorNegocio("Ese cliente está dado de baja");
      for (const r of hoja.renglones) await validarPersona(tx, r.chofer_id, "Ese chofer");

      const viajes = await tx
        .insert(viaje)
        .values(
          hoja.renglones.map((r, i) => ({
            fecha: r.fecha,
            importe: aNumeric(r.importe),
            forma_pago: "fiado" as const,
            cliente_id: clienteId,
            chofer_id: r.chofer_id ?? null,
            origen: "carga_inicial" as const,
            nota: r.nota?.trim() || (r.chofer_id ? null : "Chofer anterior"),
            op_key: `${hoja.op_key}:v${i}`,
          })),
        )
        .returning({ id: viaje.id });

      // Los pagos de la hoja se aplican como cualquier pago: a lo más viejo primero.
      const pagosOrdenados = hoja.pagos.map((p, i) => ({ ...p, i })).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.i - b.i));
      for (const pago of pagosOrdenados) {
        const [nuevo] = await tx
          .insert(cobro)
          .values({
            cliente_id: clienteId,
            fecha: pago.fecha,
            importe: aNumeric(pago.importe),
            medio: null,
            origen: "carga_inicial",
            nota: "Pago anotado en la hoja de papel",
            op_key: `${hoja.op_key}:p${pago.i}`,
          })
          .returning({ id: cobro.id });
        const { imputaciones, sobrante } = imputarFIFO(await deudasDe(tx, clienteId), pago.importe);
        if (sobrante > 0) throw new ErrorNegocio("Los pagos suman más de lo que debe. Revisá la hoja.");
        if (imputaciones.length) {
          await tx
            .insert(imputacion)
            .values(imputaciones.map((i) => ({ cobro_id: nuevo!.id, viaje_id: i.viajeId, importe: aNumeric(i.importe) })));
        }
      }

      await registrarAuditoria(tx, {
        tabla: "cliente",
        registroId: clienteId,
        accion: "crear",
        despues: {
          carga_inicial: {
            viajes: viajes.map((v) => v.id),
            renglones: hoja.renglones.map((r) => ({ ...r, importe: aNumeric(r.importe) })),
            pagos: hoja.pagos.map((p) => ({ ...p, importe: aNumeric(p.importe) })),
            total_hoja: aNumeric(hoja.total_hoja),
          },
        },
        motivo: "Carga inicial de la hoja de papel",
        usuarioId,
      });
    });
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    return { repetido: true, cliente: await resumenCliente(db, clienteId) };
  }
  return { repetido: false, cliente: await resumenCliente(db, clienteId) };
}
