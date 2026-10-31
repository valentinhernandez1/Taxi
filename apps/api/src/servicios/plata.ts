/**
 * Dónde está la plata (flujos 5 y 6): saldos por lugar, entregas de quienes
 * tienen plata y acreditaciones de Handy. Todo sale de `movimiento`.
 */
import {
  aNumeric,
  type Centesimos,
  comisionDeAcreditacion,
  comisionHandyEstimada,
  type Dia,
  desdeNumeric,
  diferenciaDeEntrega,
  formatearImporte,
} from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { acreditacionHandy, acreditacionHandyViaje, categoriaGasto, cuenta, entrega, gasto, persona } from "../db/schema";
import { ErrorNegocio } from "../errores";
import { leerAjustes } from "./ajustes";
import { registrarAuditoria } from "./auditoria";
import { validarDia } from "./comun";
import { cuentaAEntregar, cuentaBase, registrarMovimiento } from "./cuentas";
import { esDuplicado } from "./fiados";

const $ = (c: number) => formatearImporte(c as Centesimos, { sinDecimales: true });

export async function saldoDe(tx: DbOTx, cuentaId: number): Promise<Centesimos> {
  const [fila] = await tx.execute<{ saldo: string }>(sql`select saldo::text from saldo_cuenta where cuenta_id = ${cuentaId}`);
  return desdeNumeric(fila?.saldo ?? "0");
}

/** Viajes con tarjeta que todavía no cayeron al banco. */
async function viajesHandyPendientes(tx: DbOTx) {
  return tx.execute<{ id: string; fecha: string; importe: string }>(sql`
    select v.id, v.fecha::text, v.importe::text from viaje v
    where v.forma_pago = 'tarjeta' and not v.anulado
      and not exists (select 1 from acreditacion_handy_viaje a where a.viaje_id = v.id)
    order by v.fecha, v.id`);
}

export async function resumenPlata(db: Db) {
  const cuentas = await db.execute<{ tipo: string; persona_id: string | null; saldo: string }>(
    sql`select tipo::text, persona_id::text, saldo::text from saldo_cuenta`,
  );
  const base = (tipo: string) => desdeNumeric(cuentas.find((c) => c.tipo === tipo && !c.persona_id)?.saldo ?? "0");

  // Quién tiene plata para entregar, y desde cuándo (desde su última entrega).
  const personas = await db.execute<{ persona_id: string; nombre: string; tipo: string; saldo: string; desde: string | null }>(sql`
    select s.persona_id::text, p.nombre, p.tipo::text, s.saldo::text,
      (select min(m.fecha)::text from movimiento m
        where m.cuenta_hacia = s.cuenta_id
          and m.fecha >= coalesce((select max(e.fecha) from entrega e where e.persona_id = s.persona_id and not e.anulado), '-infinity'::date)
      ) as desde
    from saldo_cuenta s join persona p on p.id = s.persona_id
    where s.tipo = 'a_entregar' and s.saldo <> 0
    order by s.saldo desc`);
  const lista = personas.map((p) => ({
    persona_id: Number(p.persona_id),
    nombre: p.nombre,
    tipo: p.tipo,
    saldo: desdeNumeric(p.saldo),
    desde: p.desde,
  }));
  const pendientesHandy = await viajesHandyPendientes(db);
  const ajustes = await leerAjustes(db);
  const handy = base("handy");
  return {
    caja: base("caja"),
    banco: base("banco"),
    handy,
    a_entregar: lista.reduce((s, p) => s + p.saldo, 0),
    personas: lista,
    handy_viajes: pendientesHandy.length,
    handy_comision_estimada: comisionHandyEstimada(handy, ajustes.comision_handy_puntos),
  };
}

export interface NuevaEntrega {
  op_key: string;
  persona_id: number;
  fecha: Dia;
  entregado: Centesimos;
  nota?: string | null;
}

/** Caso 8: la persona entrega lo que tenía; si no coincide, la diferencia queda con su nota. */
export async function recibirEntrega(db: Db, usuarioId: number, datos: NuevaEntrega) {
  validarDia(datos.fecha);
  const [ya] = await db.select().from(entrega).where(eq(entrega.op_key, datos.op_key));
  if (ya) return { entrega: ya, repetido: true };
  try {
    const nueva = await db.transaction(async (tx) => {
      const [p] = await tx.select().from(persona).where(eq(persona.id, datos.persona_id));
      if (!p) throw new ErrorNegocio("Esa persona no existe", 404);
      const cuentaPersona = await cuentaAEntregar(tx, datos.persona_id);
      await tx.select().from(cuenta).where(eq(cuenta.id, cuentaPersona)).for("update");
      const esperado = await saldoDe(tx, cuentaPersona);
      const diferencia = diferenciaDeEntrega(esperado, datos.entregado);
      const nota = datos.nota?.trim() || null;
      if (diferencia !== 0 && !nota) {
        throw new ErrorNegocio(
          diferencia > 0
            ? `Faltan ${$(diferencia)}: tenía que entregar ${$(esperado)}. Anotá por qué no coincide.`
            : `Entregó ${$(-diferencia)} de más: tenía que entregar ${$(esperado)}. Anotá por qué.`,
          400,
          { esperado, diferencia },
        );
      }
      const [fila] = await tx
        .insert(entrega)
        .values({
          persona_id: datos.persona_id,
          fecha: datos.fecha,
          esperado: aNumeric(esperado),
          entregado: aNumeric(datos.entregado),
          diferencia: aNumeric(diferencia),
          nota,
          op_key: datos.op_key,
        })
        .returning();
      const caja = await cuentaBase(tx, "caja");
      const externo = await cuentaBase(tx, "externo");
      const comun = { fecha: datos.fecha, origenTabla: "entrega", origenId: fila!.id };
      if (datos.entregado > 0) {
        await registrarMovimiento(tx, { ...comun, importe: datos.entregado, desde: cuentaPersona, hacia: caja, tipo: "entrega", opKey: `${datos.op_key}:entrega` });
      }
      if (diferencia > 0) {
        await registrarMovimiento(tx, { ...comun, importe: diferencia, desde: cuentaPersona, hacia: externo, tipo: "faltante_entrega", opKey: `${datos.op_key}:faltante` });
      } else if (diferencia < 0) {
        await registrarMovimiento(tx, { ...comun, importe: -diferencia as Centesimos, desde: externo, hacia: cuentaPersona, tipo: "sobrante_entrega", opKey: `${datos.op_key}:sobrante` });
      }
      await registrarAuditoria(tx, {
        tabla: "entrega",
        registroId: fila!.id,
        accion: "crear",
        despues: { persona: p.nombre, esperado: aNumeric(esperado), entregado: aNumeric(datos.entregado), diferencia: aNumeric(diferencia) },
        motivo: nota,
        usuarioId,
      });
      return fila!;
    });
    return { entrega: nueva, repetido: false };
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otra] = await db.select().from(entrega).where(eq(entrega.op_key, datos.op_key));
    return { entrega: otra!, repetido: true };
  }
}

export interface NuevaAcreditacion {
  op_key: string;
  fecha: Dia;
  importe_acreditado: Centesimos;
}

/** Caso 9: lo que había con tarjeta cayó al banco; la diferencia es comisión de Handy (un gasto). */
export async function acreditarHandy(db: Db, usuarioId: number, datos: NuevaAcreditacion) {
  validarDia(datos.fecha);
  const [ya] = await db.select().from(acreditacionHandy).where(eq(acreditacionHandy.op_key, datos.op_key));
  if (ya) return { acreditacion_id: ya.id, comision: 0 as Centesimos, repetido: true };
  try {
    return await db.transaction(async (tx) => {
      const handy = await cuentaBase(tx, "handy");
      await tx.select().from(cuenta).where(eq(cuenta.id, handy)).for("update");
      const esperado = await saldoDe(tx, handy);
      if (esperado <= 0) throw new ErrorNegocio("No hay cobros con tarjeta esperando acreditarse.");
      let comision: Centesimos;
      try {
        comision = comisionDeAcreditacion(esperado, datos.importe_acreditado);
      } catch (e) {
        throw new ErrorNegocio((e as Error).message);
      }
      const viajes = await viajesHandyPendientes(tx);
      const [nueva] = await tx
        .insert(acreditacionHandy)
        .values({ fecha: datos.fecha, importe_esperado: aNumeric(esperado), importe_acreditado: aNumeric(datos.importe_acreditado), op_key: datos.op_key })
        .returning({ id: acreditacionHandy.id });
      if (viajes.length) {
        await tx.insert(acreditacionHandyViaje).values(viajes.map((v) => ({ acreditacion_id: nueva!.id, viaje_id: Number(v.id) })));
      }
      const comun = { fecha: datos.fecha, origenTabla: "acreditacion_handy", origenId: nueva!.id };
      await registrarMovimiento(tx, { ...comun, importe: datos.importe_acreditado, desde: handy, hacia: await cuentaBase(tx, "banco"), tipo: "acreditacion_handy", opKey: `${datos.op_key}:banco` });
      if (comision > 0) {
        const [categoria] = await tx.select({ id: categoriaGasto.id }).from(categoriaGasto).where(eq(categoriaGasto.nombre, "Comisión Handy"));
        if (!categoria) throw new Error("Falta la categoría 'Comisión Handy' (migración 0006)");
        const [g] = await tx
          .insert(gasto)
          .values({
            fecha: datos.fecha,
            importe: aNumeric(comision),
            categoria_id: categoria.id,
            descripcion: `Comisión de Handy (${viajes.length} viajes con tarjeta)`,
            estado: "pagado",
            fecha_pago: datos.fecha,
            pagado_desde: handy,
            op_key: `${datos.op_key}:comision`,
          })
          .returning({ id: gasto.id });
        await registrarMovimiento(tx, { fecha: datos.fecha, importe: comision, desde: handy, hacia: await cuentaBase(tx, "externo"), tipo: "gasto", origenTabla: "gasto", origenId: g!.id, opKey: `${datos.op_key}:comision:mov` });
      }
      await registrarAuditoria(tx, {
        tabla: "acreditacion_handy",
        registroId: nueva!.id,
        accion: "crear",
        despues: { esperado: aNumeric(esperado), acreditado: aNumeric(datos.importe_acreditado), comision: aNumeric(comision), viajes: viajes.length },
        usuarioId,
      });
      return { acreditacion_id: nueva!.id, comision, repetido: false };
    });
  } catch (error) {
    if (!esDuplicado(error)) throw error;
    const [otra] = await db.select().from(acreditacionHandy).where(and(eq(acreditacionHandy.op_key, datos.op_key)));
    return { acreditacion_id: otra!.id, comision: 0 as Centesimos, repetido: true };
  }
}
