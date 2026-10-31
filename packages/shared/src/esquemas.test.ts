import { describe, expect, it } from "vitest";
import {
  AJUSTES,
  ajustesPorDefecto,
  esClaveAjuste,
  esquemaLogin,
  esquemaPasswordNueva,
  validarCoherenciaAjustes,
} from "./esquemas";

describe("ajustes", () => {
  it("los valores por defecto pasan su propio esquema", () => {
    for (const [clave, def] of Object.entries(AJUSTES)) {
      expect(def.esquema.safeParse(def.defecto).success, clave).toBe(true);
    }
    expect(validarCoherenciaAjustes(ajustesPorDefecto())).toBeNull();
  });

  it("no acepta claves heredadas del prototipo de Object", () => {
    expect(esClaveAjuste("moneda")).toBe(true);
    expect(esClaveAjuste("toString")).toBe(false);
    expect(esClaveAjuste("__proto__")).toBe(false);
  });

  it("el rojo tiene que ser después del amarillo", () => {
    const valores = { ...ajustesPorDefecto(), alerta_amarilla_dias: 60, alerta_roja_dias: 30 };
    expect(validarCoherenciaAjustes(valores)).toMatch(/rojo/);
  });
});

describe("login", () => {
  it("normaliza el email", () => {
    expect(esquemaLogin.parse({ email: " Dueno@Ejemplo.UY ", password: "x" }).email).toBe(
      "dueno@ejemplo.uy",
    );
  });

  it("pide contraseñas largas", () => {
    expect(esquemaPasswordNueva.safeParse("corta").success).toBe(false);
    expect(esquemaPasswordNueva.safeParse("una frase bastante larga").success).toBe(true);
  });
});
