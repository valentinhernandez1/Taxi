/**
 * Viajes fiados. Un fiado genera deuda y nunca cuenta como cobrado (caso 1):
 * no mueve plata, solo queda en la cuenta corriente del cliente.
 */
import { aNumeric, type Centesimos, type Dia, desdeNumeric, formatearImporte, imputarFIFO, verificarLimite } from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { coche, cobro, imputacion, persona, viaje } from "../db/schema";
import { ErrorNegocio, pedirConfirmacion } from "../errores";
import { registrarAuditoria } from "./auditoria";
import { bloquearCliente, deudasDe, resumenCliente } from "./clientes";
import { validarDia } from "./comun";

export interface NuevoFiado {
  op_key: string;
  cliente_id: number;
  fecha: Dia;
  importe: Centesimos;
  chofer_id?: number | null;
  coche_id?: number | null;
  /** El dueño ya vio el aviso de límite y quiere anotarlo igual. */
  confirmar_limite?: boolean;
}

/** Código de Postgres para "valor duplicado" (op_key repetido en un doble envío simultáneo). */
export function esDuplicado(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function validarPersona(tx: DbOTx, id: number | null | undefined, que: string): Promise<void> {
  if (id == null) return;
  const [p] = await tx.select({ activo: persona.activo }).from(persona).where(eq(persona.id, id));
  if (!p?.activo) throw new ErrorNegocio(`${que} no existe o está dado de baja`);
}

export async function validarCoche(tx: DbOTx, id: number | null | undefined): Promise<void> {
  if (id == null) return;
  const [c] = await tx.select({ activo: coche.activo }).from(coche).where(eq(coche.id, id));
  if (!c?.activo) throw new ErrorNegocio("Ese coche no existe o está dado de baja");
}

/**
 * Si el cliente tenía plata a favor (pagó de más con confirmación), se aplica
 * a sus fiados pendientes, otra vez de lo más viejo a lo más nuevo.
 */
export async function aplicarSaldoAFavor(tx: DbOTx, clienteId: number): Promise<void> {
  const creditos = await tx.execute<{ id: string; resto: string }>(sql`
    select c.id, (c.importe - coalesce(sum(i.importe), 0))::text as resto
    from cobro c left join imputacion i on i.cobro_id = c.id
    where c.cliente_id = ${clienteId} and not c.anulado
    group by c.id
    having c.importe - coalesce(sum(i.importe), 0) > 0
    order by c.fecha, c.id`);
  if (creditos.length === 0) return;
  let deudas = await deudasDe(tx, clienteId);
  for (const credito of creditos) {
    const { imputaciones } = imputarFIFO(deudas, desdeNumeric(credito.resto));
    for (const i of imputaciones) {
      await tx
        .insert(imputacion)
        .values({ cobro_id: Number(credito.id), viaje_id: i.viajeId, importe: aNumeric(i.importe) })
        .onConflictDoUpdate({
          target: [imputacion.cobro_id, imputacion.viaje_id],
          set: { importe: sql`${imputacion.importe} + excluded.importe` },
        });
    }
    deudas = await deudasDe(tx, clienteId);
  }
}

export async function anotarFiado(db: Db, usuarioId: number, datos: NuevoFiado) {
  validarDia(datos.fecha);
  const [existente] = await db.select({ id: viaje.id }).from(viaje).where(eq(viaje.op_key, datos.op_key));
  if (existente) return { viaje_id: existente.id, repetido: true, cliente: await resumenCliente(db, datos.cliente_id) };

  try {
    const viajeId = await db.transaction(async (tx) => {
      const datosCliente = await bloquearCliente(tx, datos.cliente_id);
      if (!datosCliente.activo) throw new ErrorNegocio("Ese cliente está dado de baja");
      await validarPersona(tx, datos.chofer_id, "Ese chofer");
      await validarCoche(tx, datos.coche_id);

      const debe = (await deudasDe(tx, datos.cliente_id)).reduce((s, d) => s + d.pendiente, 0) as Centesimos;
      const limite = datosCliente.limite_fiado === null ? null : desdeNumeric(datosCliente.limite_fiado);
      const control = verificarLimite(debe, datos.importe, limite);
      if (control.supera && !datos.confirmar_limite) {
        throw pedirConfirmacion(
          "limite",
          `Con este viaje ${datosCliente.nombre} quedaría debiendo ${formatearImporte(control.quedaria, { sinDecimales: true })}, ` +
            `más que su límite de ${formatearImporte(limite!, { sinDecimales: true })}.`,
          { debe, limite, quedaria: control.quedaria },
        );
      }

      const [nuevo] = await tx
        .insert(viaje)
        .values({
          fecha: datos.fecha,
          importe: aNumeric(datos.importe),
          forma_pago: "fiado",
          cliente_id: datos.cliente_id,
          chofer_id: datos.chofer_id ?? null,
          coche_id: datos.coche_id ?? null,
          op_key: datos.op_key,
        })
        .returning({ id: viaje.id });
      await aplicarSaldoAFavor(tx, datos.cliente_id);
      await registrarAuditoria(tx, {
        tabla: "viaje",
        registroId: nuevo!.id,
        accion: "crear",
        despues: { ...datos, importe: aNumeric(datos.importe), forma_pago: "fiado" },
        motivo: control.supera ? "Pasa el límite de fiado; el dueño confirmó" : null,
        usuarioId,
      });
      return nuevo!.id;
    });
    return { viaje_id: viajeId, repetido: false, cliente: await resumenCliente(db, datos.cliente_id) };
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [ya] = await db.select({ id: viaje.id }).from(viaje).where(eq(viaje.op_key, datos.op_key));
    return { viaje_id: ya!.id, repetido: true, cliente: await resumenCliente(db, datos.cliente_id) };
  }
}

/** Nada confirmado se borra (regla 6): se anula con motivo y queda en la auditoría. */
export async function anularFiado(db: Db, usuarioId: number, viajeId: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(viaje).where(and(eq(viaje.id, viajeId), eq(viaje.forma_pago, "fiado")));
    if (!v) throw new ErrorNegocio("Ese viaje fiado no existe", 404);
    await bloquearCliente(tx, v.cliente_id!);
    if (v.anulado) return { cliente_id: v.cliente_id! };
    if (v.liquidacion_id) {
      throw new ErrorNegocio("Este fiado ya está en la liquidación de un turno. Para anularlo, primero anulá esa liquidación.");
    }
    const pagos = await tx
      .select({ id: cobro.id })
      .from(imputacion)
      .innerJoin(cobro, eq(cobro.id, imputacion.cobro_id))
      .where(and(eq(imputacion.viaje_id, viajeId), eq(cobro.anulado, false)));
    if (pagos.length > 0) {
      throw new ErrorNegocio("Este viaje ya tiene pagos aplicados. Para anularlo, primero anulá esos cobros.");
    }
    const ahora = new Date();
    await tx.update(viaje).set({ anulado: true, anulado_en: ahora, motivo_anulacion: motivo }).where(eq(viaje.id, viajeId));
    await registrarAuditoria(tx, {
      tabla: "viaje",
      registroId: viajeId,
      accion: "anular",
      antes: { anulado: false, importe: v.importe, fecha: v.fecha },
      despues: { anulado: true },
      motivo,
      usuarioId,
    });
    return { cliente_id: v.cliente_id! };
  });
}
