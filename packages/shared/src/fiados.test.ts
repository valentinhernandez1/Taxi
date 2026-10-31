import { describe, expect, it } from "vitest";
import { type Centesimos, parsearImporte } from "./dinero";
import {
  antiguedadDias,
  aplicarImputaciones,
  type DeudaViaje,
  enlaceWhatsApp,
  imputarFIFO,
  mensajeRecordatorio,
  nivelDeAlerta,
  telefonoWhatsApp,
  totalDeLaHoja,
  totalPendiente,
  verificarLimite,
} from "./fiados";

const $ = (texto: string): Centesimos => parsearImporte(texto);
const deuda = (viajeId: number, fecha: string, pendiente: string): DeudaViaje => ({ viajeId, fecha, pendiente: $(pendiente) });

describe("caso 2 — pago parcial", () => {
  it("debe 1.000, paga 400: el saldo queda en 600 y el viaje sigue valiendo 1.000", () => {
    const deudas = [deuda(1, "2026-10-12", "1.000")];
    const { imputaciones, sobrante } = imputarFIFO(deudas, $("400"));
    expect(imputaciones).toEqual([{ viajeId: 1, importe: $("400") }]);
    expect(sobrante).toBe(0);
    expect(totalPendiente(aplicarImputaciones(deudas, imputaciones))).toBe($("600"));
    expect(deudas[0]!.pendiente).toBe($("1.000")); // no se toca el original
  });
});

describe("caso 3 — FIFO", () => {
  const deudas = [deuda(2, "2026-10-14", "300"), deuda(1, "2026-10-12", "500")];

  it("fiados lunes 500 y miércoles 300; paga 600: lunes saldado, miércoles queda 200", () => {
    const { imputaciones, sobrante } = imputarFIFO(deudas, $("600"));
    expect(imputaciones).toEqual([
      { viajeId: 1, importe: $("500") },
      { viajeId: 2, importe: $("100") },
    ]);
    expect(sobrante).toBe(0);
    const despues = aplicarImputaciones(deudas, imputaciones);
    expect(totalPendiente(despues)).toBe($("200"));
    // La antigüedad ahora se cuenta desde el miércoles.
    expect(antiguedadDias(despues, "2026-10-20")).toBe(6);
    expect(antiguedadDias(deudas, "2026-10-20")).toBe(8);
  });

  it("a igual fecha, primero el que se anotó antes", () => {
    const { imputaciones } = imputarFIFO([deuda(9, "2026-10-12", "100"), deuda(3, "2026-10-12", "100")], $("100"));
    expect(imputaciones).toEqual([{ viajeId: 3, importe: $("100") }]);
  });

  it("saltea viajes ya pagos", () => {
    const { imputaciones } = imputarFIFO([deuda(1, "2026-10-01", "0"), deuda(2, "2026-10-02", "50")], $("50"));
    expect(imputaciones).toEqual([{ viajeId: 2, importe: $("50") }]);
  });
});

describe("caso 4 — pago mayor", () => {
  it("debe 200, paga 300: sobran 100 (la API lo rechaza salvo confirmación)", () => {
    const { imputaciones, sobrante } = imputarFIFO([deuda(1, "2026-10-12", "200")], $("300"));
    expect(imputaciones).toEqual([{ viajeId: 1, importe: $("200") }]);
    expect(sobrante).toBe($("100"));
  });
});

describe("caso 20 — límite de fiado", () => {
  it("límite 2.000, debe 1.300, fiado 800: avisa", () => {
    expect(verificarLimite($("1.300"), $("800"), $("2.000"))).toEqual({
      supera: true,
      disponible: $("700"),
      quedaria: $("2.100"),
    });
  });

  it("justo en el límite no avisa; sin límite nunca avisa", () => {
    expect(verificarLimite($("1.300"), $("700"), $("2.000")).supera).toBe(false);
    expect(verificarLimite($("99.999"), $("1"), null)).toEqual({ supera: false, disponible: null, quedaria: $("100.000") });
  });
});

describe("antigüedad y alertas", () => {
  it("sin deuda no hay antigüedad", () => {
    expect(antiguedadDias([], "2026-10-20")).toBeNull();
    expect(antiguedadDias([deuda(1, "2026-01-01", "0")], "2026-10-20")).toBeNull();
    expect(nivelDeAlerta(null, { amarilla: 30, roja: 60 })).toBe("sin_deuda");
  });

  it("amarillo a los 30 y rojo a los 60 por defecto", () => {
    const umbrales = { amarilla: 30, roja: 60 };
    expect(nivelDeAlerta(29, umbrales)).toBe("normal");
    expect(nivelDeAlerta(30, umbrales)).toBe("amarilla");
    expect(nivelDeAlerta(60, umbrales)).toBe("roja");
  });

  it("con plazo propio: rojo al vencer, amarillo la semana antes", () => {
    const umbrales = { amarilla: 30, roja: 60 };
    expect(nivelDeAlerta(7, umbrales, 15)).toBe("normal");
    expect(nivelDeAlerta(9, umbrales, 15)).toBe("amarilla");
    expect(nivelDeAlerta(16, umbrales, 15)).toBe("roja");
  });
});

describe("WhatsApp", () => {
  it.each([
    ["099 123 456", "59899123456"],
    ["99123456", "59899123456"],
    ["+598 99 123 456", "59899123456"],
    ["00598 99123456", "59899123456"],
    ["4222 1234", "59842221234"],
    ["2900 1234", "59829001234"],
  ])("%s → %s", (entrada, esperado) => {
    expect(telefonoWhatsApp(entrada)).toBe(esperado);
  });

  it.each(["", "123", "099 123 45", "+54 11 1234 5678"])("rechaza %j", (entrada) => {
    expect(telefonoWhatsApp(entrada)).toBeNull();
  });

  it("arma el mensaje y el enlace", () => {
    const mensaje = mensajeRecordatorio({ cliente: "Rodríguez", empresa: "Taxis San Carlos", debe: $("1.300") });
    expect(mensaje).toContain("saldo de $ 1.300 por viajes");
    expect(enlaceWhatsApp("59899123456", mensaje)).toBe(`https://wa.me/59899123456?text=${encodeURIComponent(mensaje)}`);
  });
});

describe("carga inicial", () => {
  it("total de la hoja = renglones − pagos", () => {
    expect(totalDeLaHoja([{ importe: $("800") }, { importe: $("600") }, { importe: $("400") }], [{ importe: $("500") }])).toBe(
      $("1.300"),
    );
  });
});
