import { describe, expect, it } from "vitest";
import {
  aNumeric,
  aplicarPorcentaje,
  centesimos,
  desdeNumeric,
  ErrorImporte,
  formatearImporte,
  formatearPorcentaje,
  parsearImporte,
  restar,
  sumar,
  validarImportePositivo,
} from "./dinero";

describe("caso 17 — precisión", () => {
  it("0,10 + 0,20 da exactamente 0,30", () => {
    const total = sumar(parsearImporte("0,10"), parsearImporte("0,20"));
    expect(total).toBe(30);
    expect(total).toBe(parsearImporte("0,30"));
    expect(aNumeric(total)).toBe("0.30");
    expect(formatearImporte(total)).toBe("$ 0,30");
  });

  it("sumar diez veces 0,10 da 1,00 (con float daría 0,9999…)", () => {
    const diez = Array.from({ length: 10 }, () => parsearImporte("0,10"));
    expect(sumar(...diez)).toBe(100);
  });

  it("ida y vuelta con NUMERIC(12,2) no pierde nada", () => {
    for (const texto of ["0.01", "0.30", "1250.50", "9999999999.99", "-600.00"]) {
      expect(aNumeric(desdeNumeric(texto))).toBe(texto);
    }
    expect(desdeNumeric("1250.5")).toBe(125050);
    expect(desdeNumeric("7")).toBe(700);
  });

  it("rechaza enteros que no son centésimos exactos", () => {
    expect(() => centesimos(0.1 + 0.2)).toThrow(ErrorImporte);
    expect(() => centesimos(Number.MAX_SAFE_INTEGER)).toThrow(ErrorImporte);
  });
});

describe("parsearImporte", () => {
  it.each([
    ["1250", 125000],
    ["1.250", 125000],
    ["1.250,50", 125050],
    ["1250,5", 125050],
    ["$ 1.250", 125000],
    ["  600 ", 60000],
    ["10.5", 1050],
    ["0,1", 10],
    [",5", 50],
    ["1.000.000", 100000000],
  ])("%s → %i centésimos", (texto, esperado) => {
    expect(parsearImporte(texto)).toBe(esperado);
  });

  it("caso 6 — 0, −50 y 10,555 se rechazan", () => {
    expect(() => validarImportePositivo(parsearImporte("0"))).toThrow(ErrorImporte);
    expect(() => validarImportePositivo(parsearImporte("-50"))).toThrow(ErrorImporte);
    expect(() => parsearImporte("10,555")).toThrow("más de 2 decimales");
  });

  it.each(["", "abc", "1,2,3", "12.34.5", "1.25,00", "1e3"])("rechaza %j", (texto) => {
    expect(() => parsearImporte(texto)).toThrow(ErrorImporte);
  });
});

describe("formatearImporte", () => {
  it("usa el formato de Uruguay", () => {
    expect(formatearImporte(centesimos(125000))).toBe("$ 1.250,00");
    expect(formatearImporte(centesimos(5))).toBe("$ 0,05");
    expect(formatearImporte(centesimos(-60000))).toBe("-$ 600,00");
    expect(formatearImporte(centesimos(3760000), { sinDecimales: true })).toBe("$ 37.600");
    expect(formatearImporte(centesimos(100), { moneda: "USD" })).toBe("US$ 1,00");
  });
});

describe("aplicarPorcentaje", () => {
  it("caso 9 — 3 % de 800 es 24", () => {
    expect(aplicarPorcentaje(parsearImporte("800"), 300)).toBe(2400);
  });

  it("caso 10 — 30 % de 3.800 es 1.140", () => {
    expect(aplicarPorcentaje(parsearImporte("3.800"), 3000)).toBe(114000);
  });

  it("redondea al centésimo, mitades hacia arriba", () => {
    expect(aplicarPorcentaje(centesimos(5), 5000)).toBe(3); // 0,025 → 0,03
    expect(aplicarPorcentaje(centesimos(-5), 5000)).toBe(-3);
    expect(aplicarPorcentaje(centesimos(999_999_999_999), 10_000)).toBe(999_999_999_999);
  });

  it("formatea porcentajes y vuelve a leerlos igual", () => {
    expect(formatearPorcentaje(300)).toBe("3");
    expect(formatearPorcentaje(350)).toBe("3,5");
    expect(formatearPorcentaje(1234)).toBe("12,34");
    expect(formatearPorcentaje(5)).toBe("0,05");
    for (const puntos of [300, 350, 1234, 5, 0]) {
      expect(parsearImporte(formatearPorcentaje(puntos))).toBe(puntos);
    }
  });

  it("restar no se sale de los enteros", () => {
    expect(restar(parsearImporte("1.000"), parsearImporte("400"))).toBe(60000);
  });
});
