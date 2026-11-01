import { describe, expect, it } from "vitest";
import { parsearImporte } from "./dinero";
import { cuentaDelMes } from "./ganancia";
import { generarSugerencias } from "./sugerencias";

const $ = parsearImporte;

describe("ganancia del mes (ejemplo del prototipo)", () => {
  const datos = {
    facturado: $("289000"),
    parte_choferes: $("86700"),
    gastos_coches: $("108900"),
    gastos_generales: $("46000"),
    cuotas: $("9800"),
    dias_del_mes: 30,
  };
  it("ganancia del negocio y lo que queda después de la cuota", () => {
    const c = cuentaDelMes(datos);
    expect(c.ganancia_negocio).toBe($("47400"));
    expect(c.te_quedo).toBe($("37600"));
  });
  it("de cada $ 100: suma 100 justo", () => {
    const c = cuentaDelMes(datos);
    expect(c.de_cada_100).toEqual({ choferes: 30, coches: 38, generales: 16, queda: 16 });
  });
  it("punto de equilibrio por día y lo real", () => {
    const c = cuentaDelMes(datos);
    // (108.900 + 46.000 + 9.800) / (1 − 0,3) / 30 = 7.843
    expect(c.equilibrio_por_dia).toBe($("7842.86"));
    expect(c.real_por_dia).toBe($("9633.33"));
  });
  it("sin facturación no hay reparto", () => {
    expect(cuentaDelMes({ ...datos, facturado: $("0"), parte_choferes: $("0") }).de_cada_100).toBeNull();
  });
});

const vacio = {
  nombre_mes: "octubre",
  deuda: { vieja_30: $("0"), clientes_viejos: [], fiados_mes: $("0"), cobros_mes: $("0") },
  coches: [],
  categorias: [],
  vencidos: [],
  llamadas: [{ fecha: "2026-10-02", hora: "10:00" }],
};

describe("dónde ganar más", () => {
  it("sin nada para decir, no inventa sugerencias", () => {
    expect(generarSugerencias(vacio)).toEqual([]);
  });

  it("fiados viejos y deuda que crece", () => {
    const [s] = generarSugerencias({
      ...vacio,
      deuda: {
        vieja_30: $("3750"),
        clientes_viejos: [
          { nombre: "Rodríguez", debe: $("2000") },
          { nombre: "La Esquina", debe: $("1750") },
        ],
        fiados_mes: $("14500"),
        cobros_mes: $("9000"),
      },
    });
    expect(s).toMatchObject({ clave: "fiados", tipo: "gana" });
    expect(s!.texto).toContain("Rodríguez y La Esquina deben");
    expect(s!.texto).toContain("la deuda creció $ 5.500");
  });

  it("coche que gasta de más en taller que el otro", () => {
    const sug = generarSugerencias({
      ...vacio,
      coches: [
        { id: 1, nombre: "Móvil 1", facturado: $("168000"), mantenimiento: $("6720"), combustible: $("0"), anteriores: [] },
        { id: 2, nombre: "Móvil 2", facturado: $("121000"), mantenimiento: $("22500"), combustible: $("0"), anteriores: [] },
      ],
    });
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ clave: "coche:2", titulo: "Revisá el Móvil 2" });
    expect(sug[0]!.texto).toContain("19 %");
  });

  it("gasto que sube más de 15 % contra los 3 meses anteriores", () => {
    const sug = generarSugerencias({
      ...vacio,
      categorias: [
        { id: 1, nombre: "Combustible", mes: $("23000"), anteriores: [$("20000"), $("20000"), $("20000")] },
        { id: 2, nombre: "Taller", mes: $("5100"), anteriores: [$("5000"), $("5000"), $("5000")] },
      ],
    });
    expect(sug.map((s) => s.titulo)).toEqual(["Combustible subió 15 %"]);
  });

  it("vencidos y llamadas perdidas los viernes de noche", () => {
    const viernes = ["2026-10-02", "2026-10-09", "2026-10-16"].map((fecha) => ({ fecha, hora: "22:15" }));
    const sug = generarSugerencias({ ...vacio, vencidos: [{ descripcion: "Antel", dias: -2 }], llamadas: viernes });
    expect(sug.map((s) => s.titulo)).toEqual(["Pagá a tiempo", "Falta un coche los viernes de noche"]);
  });

  it("turnos sin chofer: vacíos × promedio del turno × margen", () => {
    const [s] = generarSugerencias({
      ...vacio,
      turnos_vacios: [{ coche: "Móvil 2", plantilla: "Noche", vacios: 6, promedio_turno: $("2350") }],
      margen: 0.454,
    });
    expect(s).toMatchObject({ titulo: "Cubrí el turno noche del Móvil 2", tipo: "gana", monto: "≈ $ 6.401 / mes" });
    expect(generarSugerencias({ ...vacio, turnos_vacios: [{ coche: "Móvil 2", plantilla: "Noche", vacios: 1, promedio_turno: $("2350") }], margen: 0.5 })).toEqual([]);
  });

  it("sin llamadas anotadas, invita a anotarlas", () => {
    expect(generarSugerencias({ ...vacio, llamadas: [] })[0]?.clave).toBe("llamadas");
  });
});
