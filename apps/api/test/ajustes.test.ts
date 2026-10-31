import { ajustesPorDefecto } from "@taxis/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { auditoria } from "../src/db/schema";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

describe("ajustes", () => {
  it("sin nada guardado devuelve los valores por defecto", async () => {
    const r = await pedir("/ajustes", { cookie });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.ajustes).toEqual(ajustesPorDefecto());
    expect(r.cuerpo.ajustes.moneda).toBe("UYU");
  });

  it("sin sesión no deja ver ni cambiar", async () => {
    expect((await pedir("/ajustes")).estado).toBe(401);
    expect((await pedir("/ajustes/moneda", { metodo: "PUT", cuerpo: { valor: "USD" } })).estado).toBe(401);
  });

  it("cambia un ajuste y lo deja en la auditoría con antes, después y motivo", async () => {
    const r = await pedir("/ajustes/alerta_amarilla_dias", {
      metodo: "PUT",
      cuerpo: { valor: 20, motivo: "Lo pidió el dueño" },
      cookie,
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.ajustes.alerta_amarilla_dias).toBe(20);
    expect((await pedir("/ajustes", { cookie })).cuerpo.ajustes.alerta_amarilla_dias).toBe(20);

    const historial = await pedir("/ajustes/alerta_amarilla_dias/historial", { cookie });
    expect(historial.cuerpo.historial).toHaveLength(1);
    expect(historial.cuerpo.historial[0]).toMatchObject({
      tabla: "ajuste",
      registro_id: "alerta_amarilla_dias",
      accion: "modificar",
      antes: 30,
      despues: 20,
      motivo: "Lo pidió el dueño",
    });
  });

  it("guardar el mismo valor no ensucia la auditoría", async () => {
    await pedir("/ajustes/moneda", { metodo: "PUT", cuerpo: { valor: "UYU" }, cookie });
    const filas = await conBase((db) => db.select().from(auditoria));
    expect(filas.filter((f) => f.tabla === "ajuste")).toHaveLength(0);
  });

  it("rechaza valores inválidos con un mensaje claro", async () => {
    const vacio = await pedir("/ajustes/nombre_empresa", { metodo: "PUT", cuerpo: { valor: "  " }, cookie });
    expect(vacio.estado).toBe(400);
    expect(vacio.cuerpo.error).toBe("Escribí un nombre");

    expect((await pedir("/ajustes/moneda", { metodo: "PUT", cuerpo: { valor: "EUR" }, cookie })).estado).toBe(400);
    expect((await pedir("/ajustes/alerta_roja_dias", { metodo: "PUT", cuerpo: { valor: 1.5 }, cookie })).estado).toBe(400);
  });

  it("no deja el aviso rojo antes del amarillo", async () => {
    const r = await pedir("/ajustes/alerta_roja_dias", { metodo: "PUT", cuerpo: { valor: 10 }, cookie });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toMatch(/rojo/);
  });

  it("una clave que no existe da 404", async () => {
    expect((await pedir("/ajustes/inventado", { metodo: "PUT", cuerpo: { valor: 1 }, cookie })).estado).toBe(404);
    expect((await pedir("/ajustes/__proto__", { metodo: "PUT", cuerpo: { valor: 1 }, cookie })).estado).toBe(404);
  });
});
