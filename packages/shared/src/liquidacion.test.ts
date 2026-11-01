import { describe, expect, it } from "vitest";
import { parsearImporte } from "./dinero";
import { calcularLiquidacion, describirRegla, type ReglaLiquidacion } from "./liquidacion";

const $ = parsearImporte;
const treinta = (momento_fiado: "A" | "B", modo_entrega: ReglaLiquidacion["modo_entrega"] = "se_queda_su_parte"): ReglaLiquidacion => ({
  tipo: "porcentaje",
  porcentaje_puntos: 3000,
  jornal: null,
  modo_entrega,
  momento_fiado,
});
const turno = { efectivo: $("2000"), tarjeta: $("800"), fiado: $("1000"), fiados_cobrados: $("0"), gastos: $("0"), plata_en_mano: $("2000") };

describe("liquidación", () => {
  it("caso 10 — regla A: facturado 3.800, parte 1.140, adelanto 300 aparte", () => {
    const c = calcularLiquidacion(treinta("A"), turno);
    expect(c.facturado).toBe($("3800"));
    expect(c.parte_total).toBe($("1140"));
    expect(c.adelanto_fiados).toBe($("300"));
    expect(c.parte_turno).toBe($("840"));
  });

  it("caso 11 — regla B: parte ahora 840; 300 pendientes hasta que pague el cliente", () => {
    const c = calcularLiquidacion(treinta("B"), turno);
    expect(c.parte_total).toBe($("840"));
    expect(c.pendiente_fiados).toBe($("300"));
    expect(c.adelanto_fiados).toBe(0);
  });

  it("caso 12 — con combustible 500 y se queda con su parte: entrega 2.000 − 500 − 1.140 = 360", () => {
    const c = calcularLiquidacion(treinta("A"), { ...turno, gastos: $("500") });
    expect(c.esperado).toBe($("360"));
  });

  it("si da negativo, la empresa le paga al chofer", () => {
    const c = calcularLiquidacion(treinta("A"), { ...turno, efectivo: $("0"), tarjeta: $("3000"), fiado: $("0"), plata_en_mano: $("0") });
    expect(c.esperado).toBe(-$("900"));
  });

  it("regla B: los fiados viejos que ya se cobraron se pagan en esta liquidación", () => {
    const c = calcularLiquidacion(treinta("B"), { ...turno, fiados_cobrados: $("150") });
    expect(c.parte_total).toBe($("990"));
    expect(c.esperado).toBe($("1010"));
  });

  it("jornal, mixto y sueldo", () => {
    const base = { porcentaje_puntos: null, modo_entrega: "se_queda_su_parte", momento_fiado: "A" } as const;
    expect(calcularLiquidacion({ ...base, tipo: "jornal", jornal: $("1200") }, turno).parte_total).toBe($("1200"));
    expect(calcularLiquidacion({ ...base, tipo: "mixto", jornal: $("500"), porcentaje_puntos: 1000 }, turno).parte_total).toBe($("880"));
    const sueldo = calcularLiquidacion({ ...base, tipo: "sueldo", jornal: null }, turno);
    expect(sueldo.parte_total).toBe(0);
    expect(sueldo.esperado).toBe($("2000"));
  });

  it("entrega todo: el neto es el mismo (te entrega todo y le pagás su parte)", () => {
    expect(calcularLiquidacion(treinta("A", "entrega_todo"), turno).esperado).toBe(calcularLiquidacion(treinta("A"), turno).esperado);
  });

  it("a una regla de porcentaje sin porcentaje no se la deja pasar", () => {
    expect(() => calcularLiquidacion({ ...treinta("A"), porcentaje_puntos: null }, turno)).toThrow(/porcentaje/);
  });

  it("describe la regla en palabras de todos los días", () => {
    expect(describirRegla(treinta("A"), (c) => `$ ${c / 100}`)).toBe("Cobra el 30 % de lo que hace, fiados incluidos (se le adelanta su parte) y se queda con su parte.");
  });
});
