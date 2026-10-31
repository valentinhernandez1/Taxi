import { describe, expect, it } from "vitest";
import {
  coberturaDelPeriodo,
  diaEnUruguay,
  diasDelRango,
  esDia,
  formatearDiaLargo,
  inicioDelDia,
  rangoDelDia,
  sumarDias,
} from "./fecha";

describe("caso 18 — zona horaria", () => {
  it("un viaje a las 23:30 de Uruguay cuenta para ese día, aunque en UTC ya sea el siguiente", () => {
    const viaje = new Date("2026-10-15T23:30:00-03:00");
    expect(viaje.toISOString().slice(0, 10)).toBe("2026-10-16"); // en UTC ya es viernes
    expect(diaEnUruguay(viaje)).toBe("2026-10-15");
  });

  it("00:30 de Uruguay es el día nuevo", () => {
    expect(diaEnUruguay(new Date("2026-10-16T00:30:00-03:00"))).toBe("2026-10-16");
  });

  it("el día en Uruguay empieza a las 03:00 UTC", () => {
    expect(inicioDelDia("2026-10-15").toISOString()).toBe("2026-10-15T03:00:00.000Z");
    const { desde, hasta } = rangoDelDia("2026-10-15");
    const viaje = new Date("2026-10-15T23:30:00-03:00");
    expect(viaje >= desde && viaje < hasta).toBe(true);
  });

  it("respeta el horario de verano que tuvo Uruguay hasta 2015", () => {
    // Enero de 2015: UTC−2.
    expect(inicioDelDia("2015-01-10").toISOString()).toBe("2015-01-10T02:00:00.000Z");
    expect(diaEnUruguay(new Date("2015-01-10T23:30:00-02:00"))).toBe("2015-01-10");
  });

  it("no depende de la zona del servidor", () => {
    // En Workers el reloj está en UTC; las funciones usan Intl con la zona fija.
    const viaje = new Date(Date.UTC(2026, 9, 16, 2, 30));
    expect(diaEnUruguay(viaje)).toBe("2026-10-15");
  });
});

describe("caso 16 — datos incompletos", () => {
  const semana = { desde: "2026-10-12", hasta: "2026-10-18" };

  it("una semana con un día sin viajes queda marcada incompleta", () => {
    const conDatos = diasDelRango(semana.desde, semana.hasta).filter((d) => d !== "2026-10-15");
    const cobertura = coberturaDelPeriodo(semana.desde, semana.hasta, conDatos);
    expect(cobertura.completo).toBe(false);
    expect(cobertura.diasSinCargar).toEqual(["2026-10-15"]);
  });

  it("la semana con todos los días cargados está completa", () => {
    const cobertura = coberturaDelPeriodo(
      semana.desde,
      semana.hasta,
      diasDelRango(semana.desde, semana.hasta),
    );
    expect(cobertura).toEqual({ completo: true, diasSinCargar: [] });
  });

  it("los días fuera del período no completan nada", () => {
    const cobertura = coberturaDelPeriodo("2026-10-12", "2026-10-13", ["2026-10-11", "2026-10-12"]);
    expect(cobertura.diasSinCargar).toEqual(["2026-10-13"]);
  });
});

describe("utilidades de días", () => {
  it("valida días reales", () => {
    expect(esDia("2026-02-28")).toBe(true);
    expect(esDia("2026-02-29")).toBe(false);
    expect(esDia("2026-2-1")).toBe(false);
  });

  it("suma días cruzando meses y años", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formatea como en el prototipo", () => {
    expect(formatearDiaLargo("2026-10-18")).toBe("Domingo 18 de octubre");
    expect(formatearDiaLargo("2026-09-01")).toBe("Martes 1 de setiembre");
  });
});
