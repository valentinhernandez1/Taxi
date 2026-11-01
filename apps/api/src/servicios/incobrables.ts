/**
 * Fiado incobrable (especificación §4 "Liquidación", punto 4): un fiado que no
 * se va a cobrar nunca. No se borra nada (regla 6): el viaje y sus pagos quedan,
 * lo que faltaba deja de ser deuda del cliente y se cuenta como pérdida.
 *
 * Según la regla del chofer:
 * - A (se le adelantó su parte) + "se descuenta al chofer": en su próxima
 *   liquidación se le descuenta la parte adelantada de lo que no se cobró.
 * - A + "lo absorbe la empresa": no cambia nada para el chofer.
 * - B (cobra cuando el cliente paga) + "lo absorbe la empresa": se le paga su
 *   parte como si el cliente hubiera pagado todo.
 * - B + "se descuenta al chofer": cobra solo la parte de lo que sí se pagó.
 */
import { aNumeric, centesimos, desdeNumeric, parteDe } from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { fiadoIncobrable, liquidacion, viaje } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { bloquearCliente } from "./clientes";
import { hoy } from "./comun";
import { reglaVigente } from "./liquidacion";

export async function marcarIncobrable(db: Db, usuarioId: number, viajeId: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(viaje).where(and(eq(viaje.id, viajeId), eq(viaje.forma_pago, "fiado")));
    if (!v || v.anulado) throw new ErrorNegocio("Ese fiado no existe o está anulado", 404);
    await bloquearCliente(tx, v.cliente_id!);
    const [ya] = await tx
      .select({ id: fiadoIncobrable.id })
      .from(fiadoIncobrable)
      .where(and(eq(fiadoIncobrable.viaje_id, viajeId), eq(fiadoIncobrable.anulado, false)));
    if (ya) throw new ErrorNegocio("Ese fiado ya está marcado como que no se cobra");
    const [fp] = await tx.execute<{ pagado: string; pendiente: string }>(
      sql`select pagado::text, pendiente::text from fiado_pendiente where viaje_id = ${viajeId}`,
    );
    const pendiente = desdeNumeric(fp?.pendiente ?? "0");
    const pagado = desdeNumeric(fp?.pagado ?? "0");
    if (pendiente <= 0) throw new ErrorNegocio("Ese fiado ya está pago: no hay nada que dar por perdido");

    let descuento = centesimos(0);
    let parteAPagar = centesimos(0);
    const regla = v.chofer_id ? await reglaVigente(tx, v.chofer_id, v.fecha) : null;
    const pct = regla && (regla.tipo === "porcentaje" || regla.tipo === "mixto") ? (regla.porcentaje_puntos ?? 0) : 0;
    if (regla && pct > 0) {
      if (regla.momento_fiado === "A" && regla.incobrable === "chofer") descuento = parteDe(pendiente, pct);
      if (regla.momento_fiado === "B") parteAPagar = parteDe(regla.incobrable === "empresa" ? desdeNumeric(v.importe) : pagado, pct);
    }

    const [nuevo] = await tx
      .insert(fiadoIncobrable)
      .values({
        viaje_id: viajeId,
        fecha: hoy(),
        importe: aNumeric(pendiente),
        chofer_id: v.chofer_id,
        descuento_chofer: aNumeric(descuento),
        parte_a_pagar: aNumeric(parteAPagar),
        motivo,
      })
      .returning();
    await registrarAuditoria(tx, {
      tabla: "fiado_incobrable",
      registroId: nuevo!.id,
      accion: "crear",
      despues: { viaje_id: viajeId, importe: aNumeric(pendiente), descuento_chofer: aNumeric(descuento), parte_a_pagar: aNumeric(parteAPagar) },
      motivo,
      usuarioId,
    });
    return { incobrable: { ...nuevo!, importe: pendiente, descuento_chofer: descuento, parte_a_pagar: parteAPagar }, cliente_id: v.cliente_id! };
  });
}

/** Si al final el cliente pagó: se anula con motivo y la deuda vuelve. */
export async function anularIncobrable(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [fi] = await tx.select().from(fiadoIncobrable).where(eq(fiadoIncobrable.id, id)).for("update");
    if (!fi) throw new ErrorNegocio("Eso no existe", 404);
    if (fi.anulado) return { ok: true };
    if (fi.liquidacion_id) {
      const [l] = await tx.select({ estado: liquidacion.estado }).from(liquidacion).where(eq(liquidacion.id, fi.liquidacion_id));
      if (l?.estado === "confirmada") {
        throw new ErrorNegocio("Esto ya se tuvo en cuenta en la liquidación del chofer. Para deshacerlo, primero anulá esa liquidación.");
      }
    }
    await tx.update(fiadoIncobrable).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(fiadoIncobrable.id, id));
    await registrarAuditoria(tx, {
      tabla: "fiado_incobrable",
      registroId: id,
      accion: "anular",
      antes: { anulado: false, importe: fi.importe },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
    return { ok: true };
  });
}
