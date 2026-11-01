import { describe, expect, it } from "vitest";
import { parsearImporte } from "./dinero";
import { comisionDeAcreditacion, comisionHandyEstimada, diferenciaDeEntrega, porcentajeReal } from "./plata";

const $ = parsearImporte;

describe("caso 8 — entrega con diferencia", () => {
  it("esperado 600, entrega 550: diferencia 50", () => {
    expect(diferenciaDeEntrega($("600"), $("550"))).toBe($("50"));
  });
  it("entrega justa: diferencia 0; de más: negativa", () => {
    expect(diferenciaDeEntrega($("600"), $("600"))).toBe(0);
    expect(diferenciaDeEntrega($("600"), $("650"))).toBe(-$("50"));
  });
});

describe("caso 9 — Handy", () => {
  it("tarjeta 800 con 3 %: se espera 24 de comisión", () => {
    expect(comisionHandyEstimada($("800"), 300)).toBe($("24"));
  });
  it("al acreditar 776 la comisión es 24 (3 %)", () => {
    const comision = comisionDeAcreditacion($("800"), $("776"));
    expect(comision).toBe($("24"));
    expect(porcentajeReal($("800"), comision)).toBe(300);
  });
  it("si cae más de lo esperado, se rechaza", () => {
    expect(() => comisionDeAcreditacion($("800"), $("801"))).toThrow(/más de lo que había/);
  });
});
