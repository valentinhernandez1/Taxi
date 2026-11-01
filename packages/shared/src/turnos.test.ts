import { describe, expect, it } from "vitest";
import { diasDeLaSemana, lunesDe, revisarSemana, type TurnoAsignado } from "./turnos";

const DIA = { id: 1, nombre: "Día", hora_inicio: "06:00", hora_fin: "18:00" };
const NOCHE = { id: 2, nombre: "Noche", hora_inicio: "18:00", hora_fin: "06:00" };
const LUNES = "2026-10-19";

describe("turnos", () => {
  it("la semana va de lunes a domingo", () => {
    expect(lunesDe("2026-10-25")).toBe(LUNES); // domingo
    expect(lunesDe("2026-10-19")).toBe(LUNES);
    expect(lunesDe("2026-10-22")).toBe(LUNES);
    expect(diasDeLaSemana(LUNES).at(-1)).toBe("2026-10-25");
  });

  it("cada turno sin chofer es un hueco", () => {
    const todos: TurnoAsignado[] = diasDeLaSemana(LUNES).flatMap((fecha) => [
      { fecha, coche_id: 1, plantilla_id: 1, chofer_id: 10 },
      { fecha, coche_id: 1, plantilla_id: 2, chofer_id: 11 },
    ]);
    todos[3]!.chofer_id = null;
    const r = revisarSemana(LUNES, [1], [DIA, NOCHE], todos.slice(0, -1));
    expect(r.huecos).toEqual([
      { fecha: "2026-10-20", coche_id: 1, plantilla_id: 2 },
      { fecha: "2026-10-25", coche_id: 1, plantilla_id: 2 },
    ]);
    expect(r.conflictos).toEqual([]);
  });

  it("un chofer con dos turnos el mismo día es un conflicto", () => {
    const r = revisarSemana(LUNES, [1, 2], [DIA, NOCHE], [
      { fecha: "2026-10-22", coche_id: 1, plantilla_id: 1, chofer_id: 10 },
      { fecha: "2026-10-22", coche_id: 2, plantilla_id: 2, chofer_id: 10 },
    ]);
    expect(r.conflictos).toEqual([{ chofer_id: 10, fecha: "2026-10-22", motivo: "mismo_dia" }]);
  });

  it("dos coches en el mismo turno se pisan; noche y día siguiente no", () => {
    const r = revisarSemana(LUNES, [1, 2], [DIA, NOCHE], [
      { fecha: "2026-10-19", coche_id: 1, plantilla_id: 1, chofer_id: 10 },
      { fecha: "2026-10-19", coche_id: 2, plantilla_id: 1, chofer_id: 10 },
      { fecha: "2026-10-20", coche_id: 1, plantilla_id: 2, chofer_id: 11 },
      { fecha: "2026-10-21", coche_id: 1, plantilla_id: 1, chofer_id: 11 },
    ]);
    expect(r.conflictos).toEqual([{ chofer_id: 10, fecha: "2026-10-19", motivo: "se_pisan" }]);
  });

  it("un turno de madrugada que se pisa con la noche anterior", () => {
    const MADRUGADA = { id: 3, nombre: "Madrugada", hora_inicio: "04:00", hora_fin: "10:00" };
    const r = revisarSemana(LUNES, [1, 2], [DIA, NOCHE, MADRUGADA], [
      { fecha: "2026-10-19", coche_id: 1, plantilla_id: 2, chofer_id: 10 },
      { fecha: "2026-10-20", coche_id: 2, plantilla_id: 3, chofer_id: 10 },
    ]);
    expect(r.conflictos).toEqual([{ chofer_id: 10, fecha: "2026-10-19", motivo: "se_pisan" }]);
  });
});
