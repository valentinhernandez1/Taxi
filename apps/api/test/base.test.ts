/** Reglas que la propia base garantiza, aunque el código tenga un error. */
import { aNumeric, desdeNumeric, parsearImporte, sumar } from "@taxis/shared";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditoria, cliente, coche, persona, viaje } from "../src/db/schema";
import { registrarAuditoria } from "../src/servicios/auditoria";
import { conBase, limpiarBase } from "./ayuda";

beforeEach(limpiarBase);

async function viajeDeEjemplo(importe: string, op_key: string) {
  return conBase(async (db) => {
    const [chofer] = await db.insert(persona).values({ nombre: "Chofer de ejemplo", tipo: "chofer" }).returning();
    const [movil] = await db.insert(coche).values({ nombre_movil: "Móvil 1" }).returning();
    return db
      .insert(viaje)
      .values({ fecha: "2026-10-15", importe, forma_pago: "efectivo", chofer_id: chofer!.id, coche_id: movil!.id, op_key })
      .returning();
  });
}

describe("dinero en NUMERIC(12,2)", () => {
  it("caso 17 — 0,10 + 0,20 suma exactamente 0,30 en la base y en el código", async () => {
    await viajeDeEjemplo(aNumeric(parsearImporte("0,10")), "a");
    await conBase(async (db) => {
      const [movil] = await db.select().from(coche);
      await db.insert(viaje).values({ fecha: "2026-10-15", importe: "0.20", forma_pago: "efectivo", coche_id: movil!.id, op_key: "b" });
      const rows = await db.execute<{ total: string }>(sql`select sum(importe)::text as total from viaje`);
      expect(rows[0]!.total).toBe("0.30");
      const importes = (await db.select({ importe: viaje.importe }).from(viaje)).map((v) => desdeNumeric(v.importe));
      expect(sumar(...importes)).toBe(30);
    });
  });

  it("la base no guarda un importe cero o negativo", async () => {
    await expect(viajeDeEjemplo("0", "x")).rejects.toThrow();
    await expect(viajeDeEjemplo("-50", "y")).rejects.toThrow();
  });

  it("un fiado sin cliente no entra", async () => {
    await expect(
      conBase((db) => db.insert(viaje).values({ fecha: "2026-10-15", importe: "100", forma_pago: "fiado", op_key: "f" })),
    ).rejects.toThrow();
    await conBase(async (db) => {
      const [c] = await db.insert(cliente).values({ nombre: "Cliente de ejemplo" }).returning();
      await db.insert(viaje).values({ fecha: "2026-10-15", importe: "100", forma_pago: "fiado", cliente_id: c!.id, op_key: "g" });
    });
  });
});

describe("op_key", () => {
  it("caso 5 — el mismo op_key dos veces no duplica", async () => {
    await viajeDeEjemplo("600", "doble-envio");
    await expect(viajeDeEjemplo("600", "doble-envio")).rejects.toThrow();
    const filas = await conBase((db) => db.select().from(viaje));
    expect(filas).toHaveLength(1);
  });
});

describe("auditoría", () => {
  it("no se puede modificar ni borrar", async () => {
    await conBase(async (db) => {
      await registrarAuditoria(db, { tabla: "ajuste", registroId: "moneda", accion: "modificar", antes: "UYU", despues: "USD", usuarioId: null });
      await expect(db.update(auditoria).set({ motivo: "tocado" })).rejects.toThrow();
      await expect(db.delete(auditoria)).rejects.toThrow();
      expect(await db.select().from(auditoria)).toHaveLength(1);
    });
  });

  it("la conexión trabaja en UTC (los días se calculan en código con America/Montevideo)", async () => {
    await conBase(async (db) => {
      const rows = await db.execute<{ TimeZone: string }>(sql`show time zone`);
      expect(rows[0]!.TimeZone).toBe("UTC");
    });
  });
});
