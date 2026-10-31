/** Detalles que importan al publicar (Etapa 4). */
import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { conectar, normalizarUrl } from "../src/db/cliente";
import { pedir } from "./ayuda";

describe("cadena de conexión de Neon", () => {
  it("saca channel_binding y deja el resto", () => {
    const neon = "postgresql://u:p@ep-ejemplo-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
    const limpia = new URL(normalizarUrl(neon));
    expect(limpia.searchParams.get("channel_binding")).toBeNull();
    expect(limpia.searchParams.get("sslmode")).toBe("require");
    expect(limpia.hostname).toBe("ep-ejemplo-pooler.sa-east-1.aws.neon.tech");
    expect(limpia.password).toBe("p");
  });

  it("con channel_binding en la URL la conexión anda igual", async () => {
    const url = new URL(env.DATABASE_URL);
    url.searchParams.set("channel_binding", "require");
    const { db, cerrar } = conectar(url.toString());
    try {
      const [fila] = await db.execute<{ uno: number }>(sql`select 1 as uno`);
      expect(fila!.uno).toBe(1);
    } finally {
      await cerrar();
    }
  });
});

describe("cabeceras de la API", () => {
  it("no se embebe, no se cachea y fuerza HTTPS", async () => {
    const respuesta = await pedir("/salud");
    expect(respuesta.estado).toBe(200);
    const r = await (await import("../src/app")).app.request("http://localhost/api/salud", {}, env);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("los errores también llevan las cabeceras", async () => {
    const r = await (await import("../src/app")).app.request("http://localhost/api/no-existe", {}, env);
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
