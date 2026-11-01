import { describe, expect, it } from "vitest";
import { parsearImporte } from "./dinero";
import { aguinaldoEstimado, fechaDeVencimiento, semestreAguinaldo, sumarMeses, vencimientosHasta } from "./gastos";

const $ = parsearImporte;
const base = { meses: null, dia_del_mes: 10, primer_periodo: "2026-01", fecha_fin: null, cuotas_total: null } as const;

describe("vencimientos de gastos fijos", () => {
  it("mensual: uno por mes hasta la fecha pedida", () => {
    const v = vencimientosHasta({ ...base, frecuencia: "mensual" }, "2026-04-09");
    expect(v.map((x) => x.fecha_vence)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });
  it("bimestral y anual", () => {
    expect(vencimientosHasta({ ...base, frecuencia: "bimestral" }, "2026-08-31").map((x) => x.periodo)).toEqual([
      "2026-01", "2026-03", "2026-05", "2026-07",
    ]);
    expect(vencimientosHasta({ ...base, frecuencia: "anual" }, "2028-01-10").map((x) => x.periodo)).toEqual(["2026-01", "2027-01", "2028-01"]);
  });
  it("meses específicos (por ejemplo, la patente en enero, mayo y setiembre)", () => {
    const v = vencimientosHasta({ ...base, frecuencia: "meses_especificos", meses: [1, 5, 9] }, "2026-12-31");
    expect(v.map((x) => x.periodo)).toEqual(["2026-01", "2026-05", "2026-09"]);
  });
  it("día 31 en meses cortos vence el último día", () => {
    expect(fechaDeVencimiento("2026-02", 31)).toBe("2026-02-28");
    expect(fechaDeVencimiento("2028-02", 30)).toBe("2028-02-29");
  });
  it("cuotas: se corta al llegar a la cantidad; fecha de fin también corta", () => {
    expect(vencimientosHasta({ ...base, frecuencia: "mensual", cuotas_total: 2 }, "2026-12-31")).toHaveLength(2);
    expect(vencimientosHasta({ ...base, frecuencia: "mensual", fecha_fin: "2026-03-01" }, "2026-12-31")).toHaveLength(2);
  });
  it("sumarMeses cruza el año", () => {
    expect(sumarMeses("2026-11", 3)).toBe("2027-02");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });
});

describe("aguinaldo estimado", () => {
  it("semestres: dic–may se paga en junio; jun–nov en diciembre", () => {
    expect(semestreAguinaldo("2026-10-31")).toEqual({ desde: "2026-06-01", hasta: "2026-11-30", se_paga: "diciembre" });
    expect(semestreAguinaldo("2026-12-05")).toEqual({ desde: "2026-12-01", hasta: "2027-05-31", se_paga: "junio" });
    expect(semestreAguinaldo("2027-03-01")).toEqual({ desde: "2026-12-01", hasta: "2027-05-31", se_paga: "junio" });
  });
  it("es la doceava parte de sueldos, jornales y adelantos del semestre", () => {
    const r = aguinaldoEstimado(
      [
        { concepto: "sueldo", importe: $("28000"), fecha: "2026-06-30" },
        { concepto: "sueldo", importe: $("28000"), fecha: "2026-07-31" },
        { concepto: "adelanto", importe: $("2000"), fecha: "2026-08-15" },
        { concepto: "aguinaldo", importe: $("9000"), fecha: "2026-06-20" },
        { concepto: "sueldo", importe: $("28000"), fecha: "2026-05-31" },
      ],
      "2026-10-31",
    );
    expect(r.base).toBe($("58000"));
    expect(r.importe).toBe($("4833.33"));
  });
});
