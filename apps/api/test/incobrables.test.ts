/**
 * Fiados incobrables (especificación §4 "Liquidación", punto 4): la deuda deja
 * de contarse sin borrar nada, es pérdida en la ganancia, y según la regla del
 * chofer se le descuenta su parte o la empresa la absorbe.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hoy } from "../src/servicios/comun";
import { crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-inc-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const DIA = "2026-10-12";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function crear(ruta: string, cuerpo: Record<string, unknown>, esperado = 300) {
  const r = await pedir(ruta, { metodo: "POST", cuerpo, cookie });
  expect(r.estado, `${ruta}: ${JSON.stringify(r.cuerpo)}`).toBeLessThan(esperado);
  return r.cuerpo;
}

/** Chofer con su regla, un cliente y un fiado de 1.000 en su turno (más 2.000 en efectivo). */
async function escenario(momento_fiado: "A" | "B", incobrable: "empresa" | "chofer") {
  const juan = (await crear("/personas", { nombre: "Juan (ejemplo)", tipo: "chofer" })).persona.id as number;
  await crear("/reglas", { chofer_id: juan, tipo: "porcentaje", porcentaje_puntos: 3000, modo_entrega: "se_queda_su_parte", momento_fiado, incobrable, vigente_desde: "2026-10-01" });
  const cliente = (await crear("/clientes", { nombre: "Cliente (ejemplo)" })).cliente.id as number;
  await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(2000), forma_pago: "efectivo", chofer_id: juan });
  const fiado = (await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "fiado", chofer_id: juan, cliente_id: cliente })).viaje_id as number;
  return { juan, cliente, fiado };
}

async function cuenta(chofer: number) {
  return (await pedir(`/liquidaciones/cuenta?chofer_id=${chofer}&fecha=${DIA}`, { cookie })).cuerpo.cuenta;
}

async function debe(cliente: number) {
  return (await pedir(`/clientes/${cliente}`, { cookie })).cuerpo;
}

describe("fiado incobrable", () => {
  it("la deuda deja de contarse, queda visible con su motivo y es pérdida en la ganancia", async () => {
    const { cliente, fiado } = await escenario("A", "empresa");
    await crear("/cobros", { op_key: op(), cliente_id: cliente, fecha: DIA, importe: $(400), medio: "efectivo" });
    expect((await debe(cliente)).cliente.debe).toBe($(600));

    const r = await crear(`/fiados/${fiado}/incobrable`, { motivo: "Se mudó y no contesta" });
    expect(r.incobrable).toMatchObject({ importe: $(600), descuento_chofer: 0, parte_a_pagar: 0 });
    const ficha = await debe(cliente);
    expect(ficha.cliente.debe).toBe(0);
    const item = ficha.historial.find((h: { tipo: string; id: number }) => h.tipo === "fiado" && h.id === fiado);
    expect(item).toMatchObject({ importe: $(1000), pagado: $(400), pendiente: 0, incobrable: { importe: $(600), motivo: "Se mudó y no contesta" } });

    // La pérdida cuenta en el mes en que se da por perdido (hoy); la facturación del viaje no cambia.
    const g = (await pedir(`/panel/ganancia?mes=${hoy().slice(0, 7)}`, { cookie })).cuerpo;
    expect(g.incobrables).toBe($(600));
    expect((await pedir("/panel/ganancia?mes=2026-10", { cookie })).cuerpo.facturado).toBe($(3000));

    // Dos veces no; y uno ya pago tampoco.
    expect((await pedir(`/fiados/${fiado}/incobrable`, { metodo: "POST", cuerpo: { motivo: "otra vez" }, cookie })).estado).toBe(400);

    // Si al final pagó: se anula y la deuda vuelve.
    await crear(`/fiados/incobrables/${r.incobrable.id}/anular`, { motivo: "Apareció y pagó" });
    expect((await debe(cliente)).cliente.debe).toBe($(600));
  });

  it("regla A + 'se descuenta al chofer': en la próxima liquidación se le descuenta la parte adelantada", async () => {
    const { juan, fiado } = await escenario("A", "chofer");
    // Liquidación del turno: parte 900 (300 de adelanto del fiado), entrega 1.100.
    await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1100) });
    const r = await crear(`/fiados/${fiado}/incobrable`, { motivo: "No va a pagar" });
    expect(r.incobrable.descuento_chofer).toBe($(300));

    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    const c = await cuenta(juan);
    expect(c).toMatchObject({ parte_turno: $(300), descuentos: $(300), parte_total: 0, esperado: $(1000) });
    const l = await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1000) });

    // Ya aplicado: no se descuenta dos veces, y no se puede deshacer sin anular esa liquidación.
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    expect((await cuenta(juan)).descuentos).toBe(0);
    const deshacer = await pedir(`/fiados/incobrables/${r.incobrable.id}/anular`, { metodo: "POST", cuerpo: { motivo: "Pagó" }, cookie });
    expect(deshacer.estado).toBe(400);
    await crear(`/liquidaciones/${l.liquidacion_id}/anular`, { motivo: "Para corregir" });
    await crear(`/fiados/incobrables/${r.incobrable.id}/anular`, { motivo: "Pagó" });
  });

  it("regla A + 'lo absorbe la empresa': al chofer no se le descuenta nada", async () => {
    const { juan, fiado } = await escenario("A", "empresa");
    await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1100) });
    await crear(`/fiados/${fiado}/incobrable`, { motivo: "No va a pagar" });
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    expect(await cuenta(juan)).toMatchObject({ descuentos: 0, parte_total: $(300) });
  });

  it("regla B + 'lo absorbe la empresa': se le paga su parte como si hubiera pagado todo", async () => {
    const { juan, fiado } = await escenario("B", "empresa");
    await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1400) });
    expect((await pedir(`/choferes/${juan}`, { cookie })).cuerpo.pendiente_fiados).toBe($(300));
    const r = await crear(`/fiados/${fiado}/incobrable`, { motivo: "No va a pagar" });
    expect(r.incobrable.parte_a_pagar).toBe($(300));
    expect((await pedir(`/choferes/${juan}`, { cookie })).cuerpo.pendiente_fiados).toBe(0);
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    expect(await cuenta(juan)).toMatchObject({ parte_fiados_cobrados: $(300), parte_total: $(600) });
  });

  it("regla B + 'se descuenta al chofer': cobra solo la parte de lo que sí se pagó", async () => {
    const { juan, cliente, fiado } = await escenario("B", "chofer");
    await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(1400) });
    await crear("/cobros", { op_key: op(), cliente_id: cliente, fecha: DIA, importe: $(400), medio: "transferencia" });
    const r = await crear(`/fiados/${fiado}/incobrable`, { motivo: "No va a pagar el resto" });
    expect(r.incobrable).toMatchObject({ importe: $(600), parte_a_pagar: $(120) });
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    expect((await cuenta(juan)).parte_fiados_cobrados).toBe($(120));
  });
});
