/**
 * Etapa 5 — viajes y plata (especificación §4 y casos 1, 8, 9 y 16 de §9):
 * a dónde va la plata de cada viaje, entregas con diferencia, acreditaciones
 * de Handy con comisión, anulaciones y días sin cargar.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditoria, entrega, gasto, movimiento } from "../src/db/schema";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-plata-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const DIA = "2026-10-12";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function nuevaPersona(nombre: string, tipo = "chofer") {
  const r = await pedir("/personas", { metodo: "POST", cuerpo: { nombre, tipo }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.persona.id as number;
}

function anotar(forma_pago: string, importe: number, extra: Record<string, unknown> = {}) {
  return pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe, forma_pago, ...extra }, cookie });
}

async function plata() {
  const r = await pedir("/plata", { cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo;
}

describe("a dónde va la plata de cada viaje", () => {
  it("efectivo: lo tiene el chofer hasta que lo entrega", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    expect((await anotar("efectivo", $(400), { chofer_id: juan })).estado).toBe(201);
    expect((await anotar("efectivo", $(200), { chofer_id: juan })).estado).toBe(201);
    const p = await plata();
    expect(p).toMatchObject({ caja: 0, banco: 0, handy: 0, a_entregar: $(600) });
    expect(p.personas).toEqual([expect.objectContaining({ persona_id: juan, saldo: $(600), desde: DIA })]);
  });

  it("efectivo sin chofer, o manejando el dueño: va a la caja", async () => {
    const dueno = await nuevaPersona("Dueño (ejemplo)", "otro");
    await conBase((db) => db.execute(sql`update persona set tipo = 'dueno' where id = ${dueno}`));
    await anotar("efectivo", $(300));
    await anotar("efectivo", $(100), { chofer_id: dueno });
    expect(await plata()).toMatchObject({ caja: $(400), a_entregar: 0 });
  });

  it("tarjeta: queda a acreditar por Handy, con la comisión estimada", async () => {
    await anotar("tarjeta", $(800));
    expect(await plata()).toMatchObject({ handy: $(800), handy_viajes: 1, handy_comision_estimada: $(24), caja: 0 });
  });

  it("caso 1 — fiado: no mueve plata, es deuda del cliente", async () => {
    const r1 = await pedir("/clientes", { metodo: "POST", cuerpo: { nombre: "Cliente (ejemplo)" }, cookie });
    const r = await anotar("fiado", $(1000), { cliente_id: r1.cuerpo.cliente.id });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cliente).toMatchObject({ debe: $(1000) });
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(0);
    expect((await anotar("fiado", $(1000))).estado).toBe(400);
  });

  it("los totales del día separan efectivo, tarjeta y fiado", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    const cli = (await pedir("/clientes", { metodo: "POST", cuerpo: { nombre: "Cliente (ejemplo)" }, cookie })).cuerpo.cliente.id;
    await anotar("efectivo", $(400), { chofer_id: juan });
    await anotar("tarjeta", $(800), { chofer_id: juan });
    await anotar("fiado", $(250), { chofer_id: juan, cliente_id: cli });
    const r = await pedir(`/viajes?fecha=${DIA}`, { cookie });
    expect(r.cuerpo.totales).toEqual({ efectivo: $(400), tarjeta: $(800), fiado: $(250), total: $(1450) });
    expect(r.cuerpo.viajes).toHaveLength(3);
  });

  it("doble envío: el mismo op_key no duplica el viaje ni la plata", async () => {
    const cuerpo = { op_key: op(), fecha: DIA, importe: $(500), forma_pago: "efectivo" };
    const [a, b] = await Promise.all([
      pedir("/viajes", { metodo: "POST", cuerpo, cookie }),
      pedir("/viajes", { metodo: "POST", cuerpo, cookie }),
    ]);
    expect([a.estado, b.estado].sort()).toEqual([200, 201]);
    expect((await plata()).caja).toBe($(500));
  });

  it("no se anotan días que todavía no llegaron", async () => {
    const r = await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: "2099-01-01", importe: $(1), forma_pago: "efectivo" }, cookie });
    expect(r.estado).toBe(400);
  });
});

describe("anular un viaje", () => {
  it("devuelve la plata con un movimiento inverso y queda en la auditoría", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    const r = await anotar("efectivo", $(400), { chofer_id: juan });
    const anulado = await pedir(`/viajes/${r.cuerpo.viaje_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Lo anoté dos veces" }, cookie });
    expect(anulado.estado, JSON.stringify(anulado.cuerpo)).toBe(200);
    expect((await plata()).a_entregar).toBe(0);
    const movs = await conBase((db) => db.select().from(movimiento));
    expect(movs).toHaveLength(2);
    expect(movs[1]!.revierte_id).toBe(movs[0]!.id);
    const aud = await conBase((db) => db.select().from(auditoria).where(sql`accion = 'anular'`));
    expect(aud[0]).toMatchObject({ tabla: "viaje", motivo: "Lo anoté dos veces" });
    const dia = await pedir(`/viajes?fecha=${DIA}`, { cookie });
    expect(dia.cuerpo.totales.total).toBe(0);
    expect(dia.cuerpo.viajes[0].anulado).toBe(true);
  });

  it("un viaje con tarjeta ya acreditado no se anula", async () => {
    const r = await anotar("tarjeta", $(800));
    await pedir("/plata/handy", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe_acreditado: $(776) }, cookie });
    const anulado = await pedir(`/viajes/${r.cuerpo.viaje_id}/anular`, { metodo: "POST", cuerpo: { motivo: "prueba" }, cookie });
    expect(anulado.estado).toBe(400);
  });
});

describe("caso 8 — entrega con diferencia", () => {
  it("tenía 600, entrega 550: queda la diferencia de 50 con su nota y el saldo en cero", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    await anotar("efectivo", $(400), { chofer_id: juan });
    await anotar("efectivo", $(200), { chofer_id: juan });

    const sinNota = await pedir("/plata/entregas", { metodo: "POST", cuerpo: { op_key: op(), persona_id: juan, fecha: DIA, entregado: $(550) }, cookie });
    expect(sinNota.estado).toBe(400);
    expect(sinNota.cuerpo).toMatchObject({ esperado: $(600), diferencia: $(50) });
    expect(sinNota.cuerpo.error).toMatch(/Faltan \$/);

    const r = await pedir("/plata/entregas", {
      metodo: "POST",
      cuerpo: { op_key: op(), persona_id: juan, fecha: DIA, entregado: $(550), nota: "Pagó nafta y trae el ticket" },
      cookie,
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    const [e] = await conBase((db) => db.select().from(entrega));
    expect(e).toMatchObject({ esperado: "600.00", entregado: "550.00", diferencia: "50.00", nota: "Pagó nafta y trae el ticket" });
    const p = await plata();
    expect(p).toMatchObject({ caja: $(550), a_entregar: 0 });
    expect(p.personas).toEqual([]);
  });

  it("entrega justa no pide nota; entregar de más también queda anotado", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    await anotar("efectivo", $(600), { chofer_id: juan });
    const justa = await pedir("/plata/entregas", { metodo: "POST", cuerpo: { op_key: op(), persona_id: juan, fecha: DIA, entregado: $(600) }, cookie });
    expect(justa.estado).toBe(201);
    await anotar("efectivo", $(100), { chofer_id: juan });
    const deMas = await pedir("/plata/entregas", {
      metodo: "POST",
      cuerpo: { op_key: op(), persona_id: juan, fecha: DIA, entregado: $(120), nota: "Un viaje que no anotó" },
      cookie,
    });
    expect(deMas.estado).toBe(201);
    expect(await plata()).toMatchObject({ caja: $(720), a_entregar: 0 });
  });
});

describe("caso 9 — Handy", () => {
  it("800 con tarjeta, caen 776: banco 776 y gasto de comisión 24 pagado desde Handy", async () => {
    await anotar("tarjeta", $(500));
    await anotar("tarjeta", $(300));
    const r = await pedir("/plata/handy", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe_acreditado: $(776) }, cookie });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.comision).toBe($(24));
    expect(await plata()).toMatchObject({ banco: $(776), handy: 0, handy_viajes: 0 });
    const gastos = await conBase((db) => db.select().from(gasto));
    expect(gastos).toEqual([expect.objectContaining({ importe: "24.00", estado: "pagado", fecha_pago: DIA })]);
    const vinculados = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from acreditacion_handy_viaje`));
    expect(vinculados[0]!.n).toBe(2);
  });

  it("si cae más de lo que había, se rechaza", async () => {
    await anotar("tarjeta", $(800));
    const r = await pedir("/plata/handy", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe_acreditado: $(801) }, cookie });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toMatch(/más de lo que había/);
    expect((await plata()).handy).toBe($(800));
  });

  it("sin nada con tarjeta no hay qué acreditar", async () => {
    const r = await pedir("/plata/handy", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe_acreditado: $(1) }, cookie });
    expect(r.estado).toBe(400);
  });
});

describe("caso 16 — días sin cargar", () => {
  it("dice qué días faltan; un día marcado 'no se trabajó' no falta", async () => {
    await anotar("efectivo", $(100));
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: "2026-10-14", importe: $(100), forma_pago: "efectivo" }, cookie });
    let r = await pedir("/viajes/dias?desde=2026-10-12&hasta=2026-10-15", { cookie });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo).toMatchObject({ completo: false, diasSinCargar: ["2026-10-13", "2026-10-15"] });

    await pedir("/viajes/sin-trabajo", { metodo: "POST", cuerpo: { fecha: "2026-10-13", nota: "Feriado" }, cookie });
    await pedir("/viajes/sin-trabajo", { metodo: "POST", cuerpo: { fecha: "2026-10-15" }, cookie });
    r = await pedir("/viajes/dias?desde=2026-10-12&hasta=2026-10-15", { cookie });
    expect(r.cuerpo).toMatchObject({ completo: true, diasSinCargar: [] });
  });

  it("para el aviso del inicio, antes del primer viaje no falta nada", async () => {
    let r = await pedir("/viajes/dias?desde=2026-10-01&hasta=2026-10-15&desde_el_primero=1", { cookie });
    expect(r.cuerpo).toMatchObject({ completo: true });
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: "2026-10-13", importe: $(100), forma_pago: "efectivo" }, cookie });
    r = await pedir("/viajes/dias?desde=2026-10-01&hasta=2026-10-15&desde_el_primero=1", { cookie });
    expect(r.cuerpo).toMatchObject({ completo: false, diasSinCargar: ["2026-10-14", "2026-10-15"] });
  });
});
