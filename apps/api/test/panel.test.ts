/**
 * Etapa 8 — Ganancia, Dónde ganar más, panel, llamadas perdidas y exportación.
 * Los tres números (facturación, cobrado, ganancia) nunca se mezclan (regla 1)
 * y un mes con días sin cargar dice "incompleto" (caso 16).
 */
import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-panel-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const MES = "2026-10";
const DIA = "2026-10-12";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function crear(ruta: string, cuerpo: Record<string, unknown>) {
  const r = await pedir(ruta, { metodo: "POST", cuerpo, cookie });
  expect(r.estado, `${ruta}: ${JSON.stringify(r.cuerpo)}`).toBeLessThan(300);
  return r.cuerpo;
}

async function categoria(nombre: string) {
  const r = await pedir("/categorias", { cookie });
  return r.cuerpo.categorias.find((c: { nombre: string }) => c.nombre === nombre).id as number;
}

/** Un mes con todo: viajes de un chofer liquidados, gastos de coche, generales, cuota, sueldo, cobro y Handy. */
async function mesCompleto() {
  const movil = (await crear("/coches", { nombre_movil: "Móvil 1" })).coche.id;
  const juan = (await crear("/personas", { nombre: "Juan (ejemplo)", tipo: "chofer" })).persona.id;
  const ana = (await crear("/personas", { nombre: "Ana (ejemplo)", tipo: "telefonista" })).persona.id;
  const cliente = (await crear("/clientes", { nombre: "Cliente (ejemplo)" })).cliente.id;
  await crear("/reglas", { chofer_id: juan, tipo: "porcentaje", porcentaje_puntos: 3000, modo_entrega: "se_queda_su_parte", momento_fiado: "A", vigente_desde: "2026-10-01" });
  const viaje = (forma_pago: string, importe: number, extra = {}) =>
    crear("/viajes", { op_key: op(), fecha: DIA, importe, forma_pago, chofer_id: juan, coche_id: movil, ...extra });
  await viaje("efectivo", $(2000));
  await viaje("tarjeta", $(800));
  await viaje("fiado", $(1000), { cliente_id: cliente });
  await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: DIA, entregado: $(860) });
  await crear("/plata/handy", { op_key: op(), fecha: "2026-10-15", importe_acreditado: $(776) });
  await crear("/gastos", { op_key: op(), fecha: DIA, importe: $(500), categoria_id: await categoria("Combustible"), coche_id: movil, pagado_con: { desde: "caja" } });
  await crear("/gastos", { op_key: op(), fecha: DIA, importe: $(1000), categoria_id: await categoria("BPS") });
  await crear("/gastos", { op_key: op(), fecha: DIA, importe: $(9800), categoria_id: await categoria("Cuota del coche"), coche_id: movil, pagado_con: { desde: "banco" } });
  await crear("/empleados/pagos", { op_key: op(), persona_id: ana, concepto: "sueldo", periodo: MES, importe: $(2400), fecha: "2026-10-20", pagado_con: { desde: "caja" } });
  await crear("/cobros", { op_key: op(), cliente_id: cliente, fecha: "2026-10-20", importe: $(400), medio: "transferencia" });
  return { movil, juan, cliente };
}

describe("Ganancia del mes", () => {
  it("los tres números por separado: facturación, cobrado y ganancia", async () => {
    const { movil } = await mesCompleto();
    const g = (await pedir(`/panel/ganancia?mes=${MES}`, { cookie })).cuerpo;
    expect(g).toMatchObject({
      facturado: $(3800),
      parte_choferes: $(1140),
      gastos_coches: $(500),
      // BPS 1.000 (pendiente: igual cuenta) + comisión Handy 24 + sueldo de la telefonista 2.400.
      gastos_generales: $(3424),
      cuotas: $(9800),
      ganancia_negocio: $(3800 - 1140 - 500 - 3424),
      te_quedo: $(3800 - 1140 - 500 - 3424 - 9800),
      viajes_sin_liquidar: 0,
    });
    // Cobrado: efectivo 2.000 + tarjeta acreditada 800 + cobro de fiado 400. El fiado no es plata cobrada.
    expect(g.cobrado).toMatchObject({ efectivo: $(2000), tarjeta_acreditada: $(800), cobros_de_fiados: $(400), total: $(3200), deuda_crecio: $(600) });
    // Flujo: lo cobrado menos lo que salió de verdad (el BPS pendiente todavía no salió).
    expect(g.flujo).toMatchObject({ gastos_pagados: $(500 + 9800 + 24), pagos_choferes: $(1140), pagos_empleados: $(2400), neto: $(3200 - 10324 - 1140 - 2400) });
    expect(g.por_coche).toEqual([
      expect.objectContaining({ id: movil, facturado: $(3800), parte_choferes: $(1140), funcionamiento: $(500), antes_de_cuota: $(2160), cuotas: $(9800), despues_de_cuota: $(2160 - 9800) }),
    ]);
    expect(g.de_cada_100.choferes + g.de_cada_100.coches + g.de_cada_100.generales + g.de_cada_100.queda).toBe(100);
  });

  it("caso 16 — con días sin cargar dice incompleto; marcados 'no se trabajó', queda completo", async () => {
    await mesCompleto();
    let g = (await pedir(`/panel/ganancia?mes=${MES}`, { cookie })).cuerpo;
    expect(g.completo).toBe(false);
    // Se cuenta desde el primer viaje anotado (el 12): antes de empezar a usar la app no "falta" nada.
    expect(g.dias_sin_cargar).toHaveLength(19);
    await conBase((db) =>
      db.execute(sql`insert into dia_sin_trabajo (fecha) select d::date from generate_series('2026-10-01'::date, '2026-10-31'::date, '1 day') d
        where d::date <> '2026-10-12'::date`),
    );
    g = (await pedir(`/panel/ganancia?mes=${MES}`, { cookie })).cuerpo;
    expect(g.completo).toBe(true);
  });

  it("si hay viajes sin liquidar, la parte de los choferes puede faltar: incompleto", async () => {
    await mesCompleto();
    await conBase((db) =>
      db.execute(sql`insert into dia_sin_trabajo (fecha) select d::date from generate_series('2026-10-01'::date, '2026-10-31'::date, '1 day') d
        where d::date <> '2026-10-12'::date`),
    );
    const juan = (await pedir("/choferes", { cookie })).cuerpo.choferes[0].id;
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(500), forma_pago: "efectivo", chofer_id: juan });
    const g = (await pedir(`/panel/ganancia?mes=${MES}`, { cookie })).cuerpo;
    expect(g).toMatchObject({ completo: false, viajes_sin_liquidar: 1, facturado: $(4300) });
  });

  it("la carga inicial no suma a la facturación del mes (caso 15)", async () => {
    const cliente = (await crear("/clientes", { nombre: "Cliente viejo (ejemplo)" })).cliente.id;
    await crear(`/clientes/${cliente}/carga-inicial`, {
      op_key: op(),
      renglones: [{ fecha: "2026-10-05", importe: $(700), nota: "Chofer anterior" }],
      pagos: [],
      total_hoja: $(700),
    });
    const g = (await pedir(`/panel/ganancia?mes=${MES}`, { cookie })).cuerpo;
    expect(g.facturado).toBe(0);
  });
});

describe("Dónde ganar más", () => {
  it("fiados viejos, vencidos y llamadas perdidas; se marcan como hechas y se vuelven a mostrar", async () => {
    const cliente = (await crear("/clientes", { nombre: "Rodríguez (ejemplo)" })).cliente.id;
    await crear("/fiados", { op_key: op(), cliente_id: cliente, fecha: "2026-09-01", importe: $(2000) });
    for (const fecha of ["2026-10-02", "2026-10-09", "2026-10-16"]) await crear("/panel/llamadas", { fecha, hora: "22:15" });
    await crear("/gastos-fijos", {
      categoria_id: await categoria("BPS"),
      descripcion: "Aporte BPS",
      importe: $(4500),
      frecuencia: "mensual",
      dia_del_mes: 1,
      primer_periodo: "2026-10",
    });

    let s = (await pedir(`/panel/sugerencias?mes=${MES}`, { cookie })).cuerpo;
    const claves = s.sugerencias.map((x: { clave: string }) => x.clave);
    expect(claves).toContain("fiados");
    expect(claves).toContain("vencimientos");
    expect(claves).toContain("llamadas:5-noche");
    expect(s.completo).toBe(false);

    await crear("/panel/sugerencias/estado", { clave: "fiados", periodo: MES, estado: "hecha" });
    s = (await pedir(`/panel/sugerencias?mes=${MES}`, { cookie })).cuerpo;
    expect(s.sugerencias.find((x: { clave: string }) => x.clave === "fiados").estado).toBe("hecha");
    await crear("/panel/sugerencias/estado", { clave: "fiados", periodo: MES, estado: null });
    s = (await pedir(`/panel/sugerencias?mes=${MES}`, { cookie })).cuerpo;
    expect(s.sugerencias.find((x: { clave: string }) => x.clave === "fiados").estado).toBeNull();
  });

  it("una llamada con hora inválida no se anota", async () => {
    const r = await pedir("/panel/llamadas", { metodo: "POST", cuerpo: { fecha: DIA, hora: "25:00" }, cookie });
    expect(r.estado).toBe(400);
  });
});

describe("Panel del inicio", () => {
  it("lo de hoy, el mes anterior y quién tiene plata sin entregar hace días", async () => {
    const juan = (await crear("/personas", { nombre: "Juan (ejemplo)", tipo: "chofer" })).persona.id;
    await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(1500), forma_pago: "efectivo", chofer_id: juan });
    const p = (await pedir("/panel", { cookie })).cuerpo;
    expect(p.hoy).toMatchObject({ viajes: 0 });
    expect(p.mes_anterior).toHaveProperty("te_quedo");
    expect(p.sin_rendir).toEqual([{ nombre: "Juan (ejemplo)", saldo: $(1500), desde: DIA }]);
  });
});

describe("Historial de cambios", () => {
  it("muestra las anulaciones con su motivo; con todo=1, también lo creado", async () => {
    const r = await crear("/viajes", { op_key: op(), fecha: DIA, importe: $(500), forma_pago: "efectivo" });
    await crear(`/viajes/${r.viaje_id}/anular`, { motivo: "Se anotó dos veces" });
    const solo = (await pedir("/panel/cambios", { cookie })).cuerpo.cambios;
    expect(solo).toEqual([expect.objectContaining({ tabla: "viaje", accion: "anular", motivo: "Se anotó dos veces", usuario: "dueno@ejemplo.uy" })]);
    const todo = (await pedir("/panel/cambios?todo=1", { cookie })).cuerpo.cambios;
    expect(todo.map((c: { accion: string }) => c.accion)).toEqual(expect.arrayContaining(["anular", "crear"]));
    const masViejos = (await pedir(`/panel/cambios?todo=1&antes=${todo[0].id}`, { cookie })).cuerpo.cambios;
    expect(masViejos.every((c: { id: number }) => c.id < todo[0].id)).toBe(true);
  });
});

describe("Exportar a Excel", () => {
  it("CSV con ; y coma decimal, con acentos", async () => {
    await mesCompleto();
    const r = await app.request(`http://localhost/api/panel/exportar/viajes.csv?desde=2026-10-01&hasta=2026-10-31`, { headers: { cookie } }, env);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.headers.get("content-disposition")).toContain("viajes-2026-10-01-a-2026-10-31.csv");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = new TextDecoder().decode(bytes);
    const lineas = texto.trim().split("\r\n");
    expect(lineas[0]).toBe("Fecha;Forma de pago;Importe;Chofer;Coche;Cliente;Origen;Anulado;Motivo");
    expect(lineas).toHaveLength(4);
    expect(lineas[1]).toBe("2026-10-12;efectivo;2000,00;Juan (ejemplo);Móvil 1;;normal;no;");

    const gastos = await app.request(`http://localhost/api/panel/exportar/gastos.csv?desde=2026-10-01&hasta=2026-10-31`, { headers: { cookie } }, env);
    expect(await gastos.text()).toContain("Cuota del coche;sí;Móvil 1");
    const nada = await app.request(`http://localhost/api/panel/exportar/clientes.csv`, { headers: { cookie } }, env);
    expect(nada.status).toBe(400);
    const sinSesion = await app.request(`http://localhost/api/panel/exportar/viajes.csv`, {}, env);
    expect(sinSesion.status).toBe(401);
  });
});
