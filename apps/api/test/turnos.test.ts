/**
 * Etapa 9 — turnos básicos: grilla semanal, cambio rápido de chofer, huecos y
 * superposiciones, repetir la semana, el coche del viaje desde el turno y los
 * turnos sin chofer en Ganancia / Dónde ganar más.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { turno, viaje } from "../src/db/schema";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-turno-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);
const LUNES = "2026-10-19";
const DIA = 1;
const NOCHE = 2;

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

function asignar(fecha: string, coche_id: number, plantilla_id: number, chofer_id: number | null) {
  return pedir("/turnos", { metodo: "PUT", cuerpo: { fecha, coche_id, plantilla_id, chofer_id }, cookie });
}

async function flota() {
  const m1 = (await crear("/coches", { nombre_movil: "Móvil 1" })).coche.id as number;
  const m2 = (await crear("/coches", { nombre_movil: "Móvil 2" })).coche.id as number;
  const juan = (await crear("/personas", { nombre: "Juan (ejemplo)", tipo: "chofer" })).persona.id as number;
  const carlos = (await crear("/personas", { nombre: "Carlos (ejemplo)", tipo: "chofer" })).persona.id as number;
  return { m1, m2, juan, carlos };
}

describe("grilla semanal", () => {
  it("vacía: todos los turnos son huecos; asignar cubre y 'dejar sin chofer' vuelve a hueco", async () => {
    const { m1, juan } = await flota();
    let s = (await pedir(`/turnos/semana?dia=2026-10-22`, { cookie })).cuerpo;
    expect(s.lunes).toBe(LUNES);
    expect(s.dias).toHaveLength(7);
    expect(s.plantillas.map((p: { nombre: string }) => p.nombre)).toEqual(["Día", "Noche"]);
    expect(s.huecos).toBe(7 * 2 * 2);

    expect((await asignar(LUNES, m1, DIA, juan)).estado).toBe(200);
    s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    expect(s.huecos).toBe(27);
    expect(s.turnos[0]).toMatchObject({ fecha: LUNES, coche_id: m1, plantilla_id: DIA, chofer: "Juan (ejemplo)" });

    await asignar(LUNES, m1, DIA, null);
    s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    expect(s.huecos).toBe(28);
    expect(await conBase((db) => db.select().from(turno))).toHaveLength(1);
  });

  it("avisa si un chofer tiene dos turnos el mismo día o en dos coches a la vez", async () => {
    const { m1, m2, juan } = await flota();
    await asignar(LUNES, m1, DIA, juan);
    await asignar(LUNES, m2, DIA, juan);
    await asignar("2026-10-20", m1, DIA, juan);
    await asignar("2026-10-20", m2, NOCHE, juan);
    const s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    expect(s.conflictos).toEqual([
      { chofer_id: juan, chofer: "Juan (ejemplo)", fecha: LUNES, motivo: "se_pisan" },
      { chofer_id: juan, chofer: "Juan (ejemplo)", fecha: "2026-10-20", motivo: "mismo_dia" },
    ]);
  });

  it("un cambio de último momento recuerda a quién reemplazó", async () => {
    const { m1, juan, carlos } = await flota();
    await asignar("2026-10-20", m1, DIA, juan);
    await asignar("2026-10-20", m1, DIA, carlos);
    let s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    expect(s.turnos[0]).toMatchObject({ chofer: "Carlos (ejemplo)", sustituye_a: "Juan (ejemplo)" });
    await asignar("2026-10-20", m1, DIA, juan);
    s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    expect(s.turnos[0]).toMatchObject({ chofer: "Juan (ejemplo)", sustituye_a: null });
  });

  it("no se asigna un coche o chofer dado de baja, ni un cliente como chofer", async () => {
    const { m1 } = await flota();
    const ana = (await crear("/personas", { nombre: "Ana (ejemplo)", tipo: "telefonista" })).persona.id;
    expect((await asignar(LUNES, m1, DIA, ana)).estado).toBe(400);
    expect((await asignar(LUNES, 999, DIA, null)).estado).toBe(400);
  });
});

describe("repetir la semana anterior", () => {
  it("copia a los lugares vacíos y no pisa lo que ya estaba decidido", async () => {
    const { m1, m2, juan, carlos } = await flota();
    await asignar("2026-10-12", m1, DIA, juan);
    await asignar("2026-10-12", m2, NOCHE, carlos);
    await asignar("2026-10-13", m1, DIA, null);
    // En la semana nueva ya se decidió el lunes del Móvil 1.
    await asignar(LUNES, m1, DIA, carlos);

    const r = await crear("/turnos/repetir", { dia: "2026-10-21" });
    expect(r).toEqual({ copiados: 2, ya_estaban: 1 });
    const s = (await pedir(`/turnos/semana?dia=${LUNES}`, { cookie })).cuerpo;
    const de = (fecha: string, coche: number, p: number) =>
      s.turnos.find((t: { fecha: string; coche_id: number; plantilla_id: number }) => t.fecha === fecha && t.coche_id === coche && t.plantilla_id === p);
    expect(de(LUNES, m1, DIA).chofer).toBe("Carlos (ejemplo)");
    expect(de(LUNES, m2, NOCHE).chofer).toBe("Carlos (ejemplo)");
    expect(de("2026-10-20", m1, DIA).chofer).toBeNull();

    const sinNada = await pedir("/turnos/repetir", { metodo: "POST", cuerpo: { dia: "2026-08-05" }, cookie });
    expect(sinNada.estado).toBe(400);
  });
});

describe("el coche del viaje sale del turno", () => {
  it("si el chofer tiene un solo turno ese día, el viaje toma ese coche y ese turno", async () => {
    const { m2, juan, carlos } = await flota();
    await asignar("2026-10-20", m2, NOCHE, juan);
    const r = await crear("/viajes", { op_key: op(), fecha: "2026-10-20", importe: $(500), forma_pago: "efectivo", chofer_id: juan });
    const cliente = (await crear("/clientes", { nombre: "Cliente (ejemplo)" })).cliente.id;
    const f = await crear("/viajes", { op_key: op(), fecha: "2026-10-20", importe: $(300), forma_pago: "fiado", chofer_id: juan, cliente_id: cliente });
    const sinTurno = await crear("/viajes", { op_key: op(), fecha: "2026-10-20", importe: $(100), forma_pago: "efectivo", chofer_id: carlos });
    const filas = await conBase((db) => db.select().from(viaje).orderBy(viaje.id));
    const t = await conBase((db) => db.select().from(turno));
    expect(filas.find((v) => v.id === r.viaje_id)).toMatchObject({ coche_id: m2, turno_id: t[0]!.id });
    expect(filas.find((v) => v.id === f.viaje_id)).toMatchObject({ coche_id: m2, turno_id: t[0]!.id });
    expect(filas.find((v) => v.id === sinTurno.viaje_id)).toMatchObject({ coche_id: null, turno_id: null });

    const dia = (await pedir("/turnos/dia?fecha=2026-10-20", { cookie })).cuerpo.turnos;
    expect(dia).toEqual([expect.objectContaining({ coche: "Móvil 2", plantilla: "Noche", chofer_id: juan })]);
  });
});

describe("liquidar por turno", () => {
  it("si los viajes son de un solo turno, la liquidación queda de ese turno; anulada, el turno se libera", async () => {
    const { m1, juan } = await flota();
    await crear("/reglas", { chofer_id: juan, tipo: "porcentaje", porcentaje_puntos: 3000, modo_entrega: "se_queda_su_parte", momento_fiado: "A", vigente_desde: "2026-10-01" });
    await asignar("2026-10-20", m1, NOCHE, juan);
    await crear("/viajes", { op_key: op(), fecha: "2026-10-20", importe: $(1000), forma_pago: "efectivo", chofer_id: juan });
    const ch = (await pedir("/choferes", { cookie })).cuerpo.choferes.find((c: { id: number }) => c.id === juan);
    expect(ch.ultimo_turno).toBe("Noche del Móvil 1|2026-10-20");
    const cuenta = (await pedir(`/liquidaciones/cuenta?chofer_id=${juan}&fecha=2026-10-21`, { cookie })).cuerpo;
    expect(cuenta.turnos).toEqual([expect.objectContaining({ fecha: "2026-10-20", coche: "Móvil 1", turno: "Noche" })]);

    const l = await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: "2026-10-21", entregado: $(700) });
    const [t] = await conBase((db) => db.select().from(turno));
    let fila = await conBase((db) => db.execute<{ turno_id: string | null }>(sql`select turno_id::text from liquidacion where id = ${l.liquidacion_id}`));
    expect(fila[0]!.turno_id).toBe(String(t!.id));

    await crear(`/liquidaciones/${l.liquidacion_id}/anular`, { motivo: "Para corregir" });
    fila = await conBase((db) => db.execute<{ turno_id: string | null }>(sql`select turno_id::text from liquidacion where id = ${l.liquidacion_id}`));
    expect(fila[0]!.turno_id).toBeNull();
    // Se vuelve a liquidar el mismo turno sin chocar con la anulada.
    const otra = await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: "2026-10-21", entregado: $(700) });
    fila = await conBase((db) => db.execute<{ turno_id: string | null }>(sql`select turno_id::text from liquidacion where id = ${otra.liquidacion_id}`));
    expect(fila[0]!.turno_id).toBe(String(t!.id));
  });
});

describe("turnos sin chofer en Ganancia y Dónde ganar más", () => {
  it("promedio por turno y sugerencia de cubrir los turnos vacíos", async () => {
    const { m1, juan } = await flota();
    await crear("/reglas", { chofer_id: juan, tipo: "porcentaje", porcentaje_puntos: 3000, modo_entrega: "se_queda_su_parte", momento_fiado: "A", vigente_desde: "2026-09-01" });
    // Setiembre: el Móvil 1 de día con Juan los primeros 10 días; el resto, y todas las noches, sin chofer.
    for (let d = 1; d <= 10; d++) {
      const fecha = `2026-09-${String(d).padStart(2, "0")}`;
      await asignar(fecha, m1, DIA, juan);
      await crear("/viajes", { op_key: op(), fecha, importe: $(2500), forma_pago: "efectivo", chofer_id: juan });
    }
    await crear("/liquidaciones", { op_key: op(), chofer_id: juan, fecha: "2026-09-10", entregado: $(17500) });
    const g = (await pedir("/panel/ganancia?mes=2026-09", { cookie })).cuerpo;
    expect(g.turnos).toMatchObject({ usa: true, promedio: [{ plantilla: "Día", turnos: 10, promedio: $(2500) }] });
    // 2 coches × 2 turnos × 30 días − 10 cubiertos.
    expect(g.turnos.sin_chofer).toBe(110);

    const s = (await pedir("/panel/sugerencias?mes=2026-09", { cookie })).cuerpo;
    const titulos = s.sugerencias.map((x: { titulo: string }) => x.titulo);
    expect(titulos).toContain("Cubrí el turno día del Móvil 1");
    // Del Móvil 1 de día faltaron 20 turnos: 20 × 2.500 × 70 % (sin combustible cargado).
    const m1Dia = s.sugerencias.find((x: { titulo: string }) => x.titulo === "Cubrí el turno día del Móvil 1");
    expect(m1Dia.monto).toBe("≈ $ 35.000 / mes");
  });

  it("si no se usan los turnos, no dice que estuvieron vacíos", async () => {
    await flota();
    const g = (await pedir("/panel/ganancia?mes=2026-09", { cookie })).cuerpo;
    expect(g.turnos).toMatchObject({ usa: false, sin_chofer: 0 });
    const n = await conBase((db) => db.execute<{ n: number }>(sql`select count(*)::int as n from turno`));
    expect(n[0]!.n).toBe(0);
  });
});

describe("horarios de turno", () => {
  it("se agregan, se cambian y se dejan de usar", async () => {
    const r = await crear("/turnos/horarios", { nombre: "Madrugada", hora_inicio: "02:00", hora_fin: "08:00" });
    expect(r.horario).toMatchObject({ nombre: "Madrugada" });
    const igual = await pedir("/turnos/horarios", { metodo: "POST", cuerpo: { nombre: "Raro", hora_inicio: "02:00", hora_fin: "02:00" }, cookie });
    expect(igual.estado).toBe(400);
    await pedir(`/turnos/horarios/${r.horario.id}`, { metodo: "PUT", cuerpo: { activa: false }, cookie });
    const lista = (await pedir("/turnos/horarios", { cookie })).cuerpo.horarios;
    expect(lista.map((h: { nombre: string }) => h.nombre)).toEqual(["Día", "Noche"]);
  });
});
