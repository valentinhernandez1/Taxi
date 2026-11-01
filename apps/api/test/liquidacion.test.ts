/**
 * Etapa 7 — liquidación de choferes (casos 10, 11 y 12 de §9), de punta a
 * punta: reglas con vigencia y "sin confirmar", la cuenta del turno, la plata
 * que se mueve, diferencias, la empresa que le paga al chofer y anulaciones.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { gasto, viaje } from "../src/db/schema";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-liq-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const DIA = "2026-10-12";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function nuevoChofer(nombre = "Juan (ejemplo)") {
  const r = await pedir("/personas", { metodo: "POST", cuerpo: { nombre, tipo: "chofer" }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.persona.id as number;
}

async function regla(chofer_id: number, extra: Record<string, unknown> = {}) {
  const r = await pedir("/reglas", {
    metodo: "POST",
    cuerpo: { chofer_id, tipo: "porcentaje", porcentaje_puntos: 3000, modo_entrega: "se_queda_su_parte", momento_fiado: "A", vigente_desde: "2026-10-01", ...extra },
    cookie,
  });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.regla;
}

async function nuevoCliente() {
  const r = await pedir("/clientes", { metodo: "POST", cuerpo: { nombre: "Cliente (ejemplo)" }, cookie });
  return r.cuerpo.cliente.id as number;
}

function viajeDe(chofer_id: number, forma_pago: string, importe: number, extra: Record<string, unknown> = {}) {
  return pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe, forma_pago, chofer_id, ...extra }, cookie });
}

/** Los viajes del caso 10: efectivo 2.000, tarjeta 800, fiado 1.000. */
async function turnoDelCaso(chofer: number) {
  const cliente = await nuevoCliente();
  await viajeDe(chofer, "efectivo", $(2000));
  await viajeDe(chofer, "tarjeta", $(800));
  await viajeDe(chofer, "fiado", $(1000), { cliente_id: cliente });
  return cliente;
}

function liquidar(chofer_id: number, extra: Record<string, unknown> = {}) {
  return pedir("/liquidaciones", { metodo: "POST", cuerpo: { op_key: op(), chofer_id, fecha: DIA, ...extra }, cookie });
}

async function plata() {
  return (await pedir("/plata", { cookie })).cuerpo;
}

async function categoria(nombre: string) {
  const r = await pedir("/categorias", { cookie });
  return r.cuerpo.categorias.find((c: { nombre: string }) => c.nombre === nombre).id as number;
}

describe("caso 10 — regla A", () => {
  it("facturado 3.800, parte 1.140 con el adelanto de 300 aparte; entrega 860 y su saldo queda en cero", async () => {
    const juan = await nuevoChofer();
    await regla(juan);
    await turnoDelCaso(juan);

    const cuenta = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=${DIA}`, { cookie })).cuerpo;
    expect(cuenta.viajes.cantidades).toEqual({ efectivo: 1, tarjeta: 1, fiado: 1 });
    expect(cuenta.plata_en_mano).toBe($(2000));
    expect(cuenta.cuenta).toMatchObject({ facturado: $(3800), parte_total: $(1140), adelanto_fiados: $(300), esperado: $(860) });
    expect(cuenta.regla.confirmada).toBe(false);

    const r = await liquidar(juan, { entregado: $(860) });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.regla_confirmada).toBe(false);
    const p = await plata();
    expect(p).toMatchObject({ caja: $(860), a_entregar: 0, handy: $(800) });
    const sinLiquidar = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from viaje where liquidacion_id is null`));
    expect(sinLiquidar[0]!.n).toBe(0);

    // No se liquida dos veces.
    const otra = await liquidar(juan, { entregado: 0 });
    expect(otra.estado).toBe(400);
    expect(otra.cuerpo.error).toMatch(/no tiene viajes sin liquidar/);
  });
});

describe("caso 11 — regla B", () => {
  it("parte ahora 840; 300 pendientes hasta que pague el cliente, y se pagan en la liquidación siguiente", async () => {
    const juan = await nuevoChofer();
    await regla(juan, { momento_fiado: "B" });
    const cliente = await turnoDelCaso(juan);

    const r = await liquidar(juan, { entregado: $(1160) });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.cuenta).toMatchObject({ parte_total: $(840), pendiente_fiados: $(300) });
    let ficha = (await pedir(`/choferes/${juan}`, { cookie })).cuerpo;
    expect(ficha.pendiente_fiados).toBe($(300));

    // El cliente paga el fiado: en el próximo turno se le paga su parte.
    await pedir("/cobros", { metodo: "POST", cuerpo: { op_key: op(), cliente_id: cliente, fecha: DIA, importe: $(1000), medio: "transferencia" }, cookie });
    ficha = (await pedir(`/choferes/${juan}`, { cookie })).cuerpo;
    expect(ficha.pendiente_fiados).toBe(0);
    await viajeDe(juan, "efectivo", $(100));
    const cuenta = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=${DIA}`, { cookie })).cuerpo;
    expect(cuenta.cuenta).toMatchObject({ parte_fiados_cobrados: $(300), parte_total: $(330), esperado: -$(230) });

    // Da negativo: la empresa le paga 230 de la caja.
    const cajaAntes = (await plata()).caja;
    const r2 = await liquidar(juan, {});
    expect(r2.estado, JSON.stringify(r2.cuerpo)).toBe(201);
    const p = await plata();
    expect(p.caja).toBe(cajaAntes - $(230));
    expect(p.a_entregar).toBe(0);

    // Esa parte no se vuelve a pagar.
    await viajeDe(juan, "efectivo", $(100));
    const cuenta3 = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=${DIA}`, { cookie })).cuerpo;
    expect(cuenta3.cuenta.parte_fiados_cobrados).toBe(0);
  });
});

describe("caso 12 — con combustible", () => {
  it("se queda con su parte y pagó 500 de combustible: entrega 2.000 − 500 − 1.140 = 360", async () => {
    const juan = await nuevoChofer();
    await regla(juan);
    await turnoDelCaso(juan);
    const combustible = await categoria("Combustible");
    const cuenta = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=${DIA}&gastos=${$(500)}`, { cookie })).cuerpo;
    expect(cuenta.cuenta.esperado).toBe($(360));

    const r = await liquidar(juan, { gasto: { categoria_id: combustible, importe: $(500) }, entregado: $(360) });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(await plata()).toMatchObject({ caja: $(360), a_entregar: 0 });
    const [g] = await conBase((db) => db.select().from(gasto));
    expect(g).toMatchObject({ importe: "500.00", estado: "pagado", liquidacion_id: r.cuerpo.liquidacion_id });
    const mes = (await pedir("/gastos?mes=2026-10", { cookie })).cuerpo;
    expect(mes.totales.total).toBe($(500));

    // El gasto del turno no se anula suelto.
    const a = await pedir(`/gastos/${g!.id}/anular`, { metodo: "POST", cuerpo: { motivo: "prueba" }, cookie });
    expect(a.estado).toBe(400);
  });
});

describe("entregas, reglas y anulaciones", () => {
  it("si entrega distinto, pide nota y deja la diferencia", async () => {
    const juan = await nuevoChofer();
    await regla(juan);
    await turnoDelCaso(juan);
    const sinNota = await liquidar(juan, { entregado: $(800) });
    expect(sinNota.estado).toBe(400);
    expect(sinNota.cuerpo).toMatchObject({ esperado: $(860), diferencia: $(60) });
    const r = await liquidar(juan, { entregado: $(800), nota: "Le faltó cambio" });
    expect(r.estado).toBe(201);
    expect(await plata()).toMatchObject({ caja: $(800), a_entregar: 0 });
  });

  it("sin regla no se liquida; jornal y doble envío", async () => {
    const juan = await nuevoChofer();
    await viajeDe(juan, "efectivo", $(3000));
    const sinRegla = await liquidar(juan, { entregado: 0 });
    expect(sinRegla.estado).toBe(400);
    expect(sinRegla.cuerpo.error).toMatch(/Primero cargá cómo se le paga/);

    await regla(juan, { tipo: "jornal", porcentaje_puntos: null, jornal: $(1200) });
    const cuerpo = { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1800) };
    const [a, b] = await Promise.all([
      pedir("/liquidaciones", { metodo: "POST", cuerpo, cookie }),
      pedir("/liquidaciones", { metodo: "POST", cuerpo, cookie }),
    ]);
    expect([a.estado, b.estado].sort()).toEqual([200, 201]);
    expect((await plata()).caja).toBe($(1800));
  });

  it("anular la liquidación devuelve la plata, anula el gasto y los viajes vuelven a quedar sin liquidar", async () => {
    const juan = await nuevoChofer();
    await regla(juan);
    await turnoDelCaso(juan);
    const r = await liquidar(juan, { gasto: { categoria_id: await categoria("Combustible"), importe: $(500) }, entregado: $(360) });

    const [v] = await conBase((db) => db.select().from(viaje).where(sql`forma_pago = 'efectivo'`));
    const anularViaje = await pedir(`/viajes/${v!.id}/anular`, { metodo: "POST", cuerpo: { motivo: "prueba" }, cookie });
    expect(anularViaje.estado).toBe(400);

    const a = await pedir(`/liquidaciones/${r.cuerpo.liquidacion_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Me equivoqué de chofer" }, cookie });
    expect(a.estado, JSON.stringify(a.cuerpo)).toBe(200);
    const p = await plata();
    expect(p).toMatchObject({ caja: 0, a_entregar: $(2000) });
    expect((await pedir("/gastos?mes=2026-10", { cookie })).cuerpo.totales.total).toBe(0);
    const ficha = (await pedir(`/choferes/${juan}`, { cookie })).cuerpo;
    expect(ficha.chofer.viajes_sin_liquidar).toBe(3);
    expect(ficha.liquidaciones[0]).toMatchObject({ estado: "anulada", motivo_anulacion: "Me equivoqué de chofer" });

    // Y se puede volver a liquidar bien.
    const otra = await liquidar(juan, { entregado: $(860) });
    expect(otra.estado).toBe(201);
  });

  it("una regla nueva queda sin confirmar hasta que el dueño la confirma; una usada no se cambia", async () => {
    const juan = await nuevoChofer();
    const r = await regla(juan);
    let lista = (await pedir("/choferes", { cookie })).cuerpo.choferes;
    expect(lista[0].regla).toMatchObject({ confirmada: false, porcentaje_puntos: 3000 });
    const c = await pedir(`/reglas/${r.id}/confirmar`, { metodo: "POST", cuerpo: {}, cookie });
    expect(c.cuerpo.regla.confirmada).toBe(true);
    lista = (await pedir("/choferes", { cookie })).cuerpo.choferes;
    expect(lista[0].regla.confirmada).toBe(true);

    // Cambiarla en la misma fecha la vuelve a dejar sin confirmar.
    await regla(juan, { porcentaje_puntos: 3500 });
    lista = (await pedir("/choferes", { cookie })).cuerpo.choferes;
    expect(lista[0].regla).toMatchObject({ confirmada: false, porcentaje_puntos: 3500 });

    await viajeDe(juan, "efectivo", $(1000));
    await liquidar(juan, { entregado: $(650) });
    const cambio = await pedir("/reglas", {
      metodo: "POST",
      cuerpo: { chofer_id: juan, tipo: "porcentaje", porcentaje_puntos: 4000, modo_entrega: "se_queda_su_parte", momento_fiado: "A", vigente_desde: "2026-10-01" },
      cookie,
    });
    expect(cambio.estado).toBe(400);

    // Una regla desde otra fecha rige para los turnos de esa fecha en adelante.
    await regla(juan, { porcentaje_puntos: 4000, vigente_desde: "2026-10-20" });
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: "2026-10-21", importe: $(1000), forma_pago: "efectivo", chofer_id: juan }, cookie });
    const cuenta = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=2026-10-21`, { cookie })).cuerpo;
    expect(cuenta.cuenta.parte_total).toBe($(400));
  });
});
