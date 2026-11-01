/**
 * Etapa 6 — gastos (especificación §4 "Gastos" y casos 13 y 19 de §9):
 * pendiente vs. pagado, con qué plata, cuotas aparte, gastos fijos con sus
 * vencimientos, pagos a empleados y ficha de coche.
 */
import { sumarDias } from "@taxis/shared";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditoria, gasto, movimiento, vencimiento } from "../src/db/schema";
import { hoy } from "../src/servicios/comun";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-gasto-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const DIA = "2026-10-12";
const MES = "2026-10";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function categoria(nombre: string): Promise<number> {
  const r = await pedir("/categorias", { cookie });
  const c = r.cuerpo.categorias.find((x: { nombre: string }) => x.nombre === nombre);
  if (!c) throw new Error(`Falta la categoría ${nombre}`);
  return c.id;
}

async function nuevoCoche(nombre_movil: string) {
  const r = await pedir("/coches", { metodo: "POST", cuerpo: { nombre_movil }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.coche.id as number;
}

async function nuevaPersona(nombre: string, tipo = "chofer") {
  const r = await pedir("/personas", { metodo: "POST", cuerpo: { nombre, tipo }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.persona.id as number;
}

function anotarGasto(cuerpo: Record<string, unknown>) {
  return pedir("/gastos", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, ...cuerpo }, cookie });
}

async function plata() {
  return (await pedir("/plata", { cookie })).cuerpo;
}

describe("caso 13 — gasto pendiente", () => {
  it("Seguro 3.000 pendiente: cuenta en el mes, no mueve plata; al pagar desde el banco sí", async () => {
    const movil = await nuevoCoche("Móvil 2");
    const r = await anotarGasto({ importe: $(3000), categoria_id: await categoria("Seguro"), coche_id: movil });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);

    let mes = (await pedir(`/gastos?mes=${MES}`, { cookie })).cuerpo;
    expect(mes.totales).toMatchObject({ total: $(3000), pendiente: $(3000), pagado: 0, funcionamiento: $(3000) });
    expect(await plata()).toMatchObject({ caja: 0, banco: 0 });
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(0);

    const pago = await pedir(`/gastos/${r.cuerpo.gasto_id}/pagar`, {
      metodo: "POST",
      cuerpo: { fecha: "2026-10-20", pagado_con: { desde: "banco" } },
      cookie,
    });
    expect(pago.estado, JSON.stringify(pago.cuerpo)).toBe(200);
    expect((await plata()).banco).toBe(-$(3000));
    mes = (await pedir(`/gastos?mes=${MES}`, { cookie })).cuerpo;
    expect(mes.totales).toMatchObject({ total: $(3000), pendiente: 0, pagado: $(3000) });
    expect(mes.gastos[0]).toMatchObject({ estado: "pagado", fecha_pago: "2026-10-20", pagado_desde: "Banco" });

    // Pagar dos veces no saca la plata dos veces.
    await pedir(`/gastos/${r.cuerpo.gasto_id}/pagar`, { metodo: "POST", cuerpo: { fecha: "2026-10-20", pagado_con: { desde: "banco" } }, cookie });
    expect((await plata()).banco).toBe(-$(3000));
  });
});

describe("caso 19 — cuota de coche", () => {
  it("la cuota de 9.800 del Móvil 2 no entra en funcionamiento; sí en 'después de cuota'", async () => {
    const movil = await nuevoCoche("Móvil 2");
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe: $(20000), forma_pago: "efectivo", coche_id: movil }, cookie });
    await anotarGasto({ importe: $(1500), categoria_id: await categoria("Combustible"), coche_id: movil, pagado_con: { desde: "caja" } });
    await anotarGasto({ importe: $(9800), categoria_id: await categoria("Cuota del coche"), coche_id: movil, pagado_con: { desde: "banco" } });

    const mes = (await pedir(`/gastos?mes=${MES}`, { cookie })).cuerpo;
    expect(mes.totales).toMatchObject({ funcionamiento: $(1500), cuotas: $(9800), total: $(11300) });

    const ficha = (await pedir(`/ficha-coche/${movil}?mes=${MES}`, { cookie })).cuerpo;
    expect(ficha).toMatchObject({
      facturado: $(20000),
      total_funcionamiento: $(1500),
      resultado_antes_de_cuota: $(18500),
      cuotas: $(9800),
      resultado_despues_de_cuota: $(8700),
    });
    expect(ficha.funcionamiento).toEqual([{ categoria: "Combustible", total: $(1500) }]);
  });

  it("una cuota sin coche no se acepta", async () => {
    const r = await anotarGasto({ importe: $(9800), categoria_id: await categoria("Cuota del coche") });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toMatch(/qué coche/);
  });
});

describe("con qué plata se paga", () => {
  it("con la recaudación de un chofer: baja lo que tiene que entregar", async () => {
    const juan = await nuevaPersona("Juan (ejemplo)");
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe: $(2000), forma_pago: "efectivo", chofer_id: juan }, cookie });
    const r = await anotarGasto({ importe: $(800), categoria_id: await categoria("Combustible"), pagado_con: { desde: "persona", persona_id: juan } });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect((await plata()).personas[0]).toMatchObject({ persona_id: juan, saldo: $(1200) });
  });

  it("anular un gasto pagado devuelve la plata y queda en la auditoría", async () => {
    const r = await anotarGasto({ importe: $(500), categoria_id: await categoria("Otro gasto"), pagado_con: { desde: "caja" } });
    expect((await plata()).caja).toBe(-$(500));
    const a = await pedir(`/gastos/${r.cuerpo.gasto_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Estaba repetido" }, cookie });
    expect(a.estado).toBe(200);
    expect((await plata()).caja).toBe(0);
    expect((await pedir(`/gastos?mes=${MES}`, { cookie })).cuerpo.totales.total).toBe(0);
    const aud = await conBase((db) => db.select().from(auditoria).where(sql`tabla = 'gasto' and accion = 'anular'`));
    expect(aud[0]?.motivo).toBe("Estaba repetido");
  });

  it("doble envío: un solo gasto y una sola salida de plata", async () => {
    const cuerpo = { op_key: op(), fecha: DIA, importe: $(700), categoria_id: await categoria("Taller"), pagado_con: { desde: "caja" } };
    const [a, b] = await Promise.all([pedir("/gastos", { metodo: "POST", cuerpo, cookie }), pedir("/gastos", { metodo: "POST", cuerpo, cookie })]);
    expect([a.estado, b.estado].sort()).toEqual([200, 201]);
    expect(await conBase((db) => db.select().from(gasto))).toHaveLength(1);
    expect((await plata()).caja).toBe(-$(700));
  });

  it("la comisión de Handy no se anula a mano", async () => {
    await pedir("/viajes", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe: $(800), forma_pago: "tarjeta" }, cookie });
    await pedir("/plata/handy", { metodo: "POST", cuerpo: { op_key: op(), fecha: DIA, importe_acreditado: $(776) }, cookie });
    const [g] = await conBase((db) => db.select().from(gasto));
    const a = await pedir(`/gastos/${g!.id}/anular`, { metodo: "POST", cuerpo: { motivo: "prueba" }, cookie });
    expect(a.estado).toBe(400);
  });
});

describe("categorías", () => {
  it("se agregan, se editan y no se repiten", async () => {
    const r = await pedir("/categorias", { metodo: "POST", cuerpo: { nombre: "Peajes", es_de_coche: true }, cookie });
    expect(r.estado).toBe(201);
    const dup = await pedir("/categorias", { metodo: "POST", cuerpo: { nombre: "peajes" }, cookie });
    expect(dup.estado).toBe(400);
    const e = await pedir(`/categorias/${r.cuerpo.categoria.id}`, { metodo: "PUT", cuerpo: { activa: false }, cookie });
    expect(e.cuerpo.categoria.activa).toBe(false);
    const g = await anotarGasto({ importe: $(100), categoria_id: r.cuerpo.categoria.id });
    expect(g.estado).toBe(400);
  });
});

describe("gastos fijos y vencimientos", () => {
  async function fijoMensual(extra: Record<string, unknown> = {}) {
    const dia = hoy();
    const r = await pedir("/gastos-fijos", {
      metodo: "POST",
      cuerpo: {
        categoria_id: await categoria("BPS"),
        descripcion: "Aporte BPS",
        importe: $(4500),
        importe_estimado: true,
        frecuencia: "mensual",
        dia_del_mes: Number(dia.slice(8, 10)),
        primer_periodo: dia.slice(0, 7),
        ...extra,
      },
      cookie,
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo.gasto_fijo.id as number;
  }

  it("genera el vencimiento de hoy, avisa, y 'Ya lo pagué' crea el gasto con el importe real", async () => {
    await fijoMensual();
    const lista = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    expect(lista[0]).toMatchObject({ fecha_vence: hoy(), dias: 0, vencido: false, avisar: true, importe_estimado: $(4500), es_estimado: true });

    const pago = await pedir(`/vencimientos/${lista[0].id}/pagar`, {
      metodo: "POST",
      cuerpo: { op_key: op(), fecha: hoy(), importe: $(4620), pagado_con: { desde: "banco" } },
      cookie,
    });
    expect(pago.estado, JSON.stringify(pago.cuerpo)).toBe(201);
    expect((await plata()).banco).toBe(-$(4620));
    const [v] = await conBase((db) => db.select().from(vencimiento).where(sql`id = ${lista[0].id}`));
    expect(v).toMatchObject({ estado: "pagado", importe_real: "4620.00", gasto_id: pago.cuerpo.gasto_id });
    const nuevos = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    expect(nuevos.find((x: { id: number }) => x.id === lista[0].id)).toBeUndefined();

    // Anular ese gasto deja el vencimiento otra vez por pagar.
    await pedir(`/gastos/${pago.cuerpo.gasto_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Lo pagué de otra cuenta" }, cookie });
    expect((await plata()).banco).toBe(0);
    const otraVez = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    expect(otraVez.find((x: { id: number }) => x.id === lista[0].id)).toBeDefined();
  });

  it("lo vencido aparece primero y en rojo; 'Avisame mañana' lo saca de los avisos de hoy", async () => {
    const dia = hoy();
    const haceDos = sumarDias(dia, -40);
    await fijoMensual({ primer_periodo: haceDos.slice(0, 7), dia_del_mes: 1 });
    let lista = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    expect(lista[0].vencido).toBe(true);
    expect(lista.map((v: { fecha_vence: string }) => v.fecha_vence)).toEqual([...lista.map((v: { fecha_vence: string }) => v.fecha_vence)].sort());

    await pedir(`/vencimientos/${lista[0].id}/manana`, { metodo: "POST", cuerpo: {}, cookie });
    lista = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    expect(lista[0]).toMatchObject({ avisar: false, pospuesto: true });

    const om = await pedir(`/vencimientos/${lista[0].id}/omitir`, { metodo: "POST", cuerpo: { motivo: "Ese mes no correspondía" }, cookie });
    expect(om.estado).toBe(200);
    expect((await pedir("/vencimientos", { cookie })).cuerpo.vencimientos.find((v: { id: number }) => v.id === lista[0].id)).toBeUndefined();
  });

  it("generar dos veces no duplica vencimientos", async () => {
    await fijoMensual();
    await pedir("/vencimientos", { cookie });
    await pedir("/vencimientos", { cookie });
    const n = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from vencimiento where periodo = ${hoy().slice(0, 7)}`));
    expect(n[0]!.n).toBe(1);
  });

  it("la cuota del coche se paga desde el vencimiento y queda aparte; cuenta las cuotas que faltan", async () => {
    const movil = await nuevoCoche("Móvil 2");
    const dia = hoy();
    const r = await pedir("/gastos-fijos", {
      metodo: "POST",
      cuerpo: {
        categoria_id: await categoria("Cuota del coche"),
        coche_id: movil,
        descripcion: "Cuota Móvil 2",
        importe: $(9800),
        frecuencia: "mensual",
        dia_del_mes: Number(dia.slice(8, 10)),
        primer_periodo: dia.slice(0, 7),
        cuotas_total: 36,
      },
      cookie,
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.gasto_fijo.es_cuota_vehiculo).toBe(true);
    const [v] = (await pedir("/vencimientos", { cookie })).cuerpo.vencimientos;
    await pedir(`/vencimientos/${v.id}/pagar`, { metodo: "POST", cuerpo: { op_key: op(), fecha: dia, importe: $(9800), pagado_con: { desde: "banco" } }, cookie });
    const ficha = (await pedir(`/ficha-coche/${movil}?mes=${dia.slice(0, 7)}`, { cookie })).cuerpo;
    expect(ficha).toMatchObject({ cuotas: $(9800), total_funcionamiento: 0, cuotas_restantes: 35 });
  });
});

describe("pagos a empleados", () => {
  it("sale de la caja, suma por concepto y estima el aguinaldo (1/12 del semestre)", async () => {
    const ana = await nuevaPersona("Ana (ejemplo)", "telefonista");
    const dia = hoy();
    const r = await pedir("/empleados/pagos", {
      metodo: "POST",
      cuerpo: { op_key: op(), persona_id: ana, concepto: "sueldo", periodo: dia.slice(0, 7), importe: $(24000), fecha: dia, pagado_con: { desde: "caja" } },
      cookie,
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect((await plata()).caja).toBe(-$(24000));

    const resumen = (await pedir(`/empleados?mes=${dia.slice(0, 7)}`, { cookie })).cuerpo;
    expect(resumen.total_del_mes).toBe($(24000));
    expect(resumen.por_concepto.sueldo).toBe($(24000));
    expect(resumen.personas.find((p: { persona_id: number }) => p.persona_id === ana)).toMatchObject({ pagado_en_el_mes: $(24000), aguinaldo_estimado: $(2000) });
    expect(resumen.aguinaldo.total_estimado).toBe($(2000));

    const a = await pedir(`/empleados/pagos/${r.cuerpo.pago_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Importe equivocado" }, cookie });
    expect(a.estado).toBe(200);
    expect((await plata()).caja).toBe(0);
    expect((await pedir(`/empleados?mes=${dia.slice(0, 7)}`, { cookie })).cuerpo.total_del_mes).toBe(0);
  });
});
