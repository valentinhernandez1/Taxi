/**
 * Fotos de comprobantes: R2 e Images simulados en local por el plugin de
 * Vitest (Images "de baja fidelidad": alcanza para achicar y cambiar formato).
 */
import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { auditoria, comprobante } from "../src/db/schema";
import { tipoDeImagen } from "../src/servicios/comprobantes";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";
import { JPEG_APAISADO, PNG_VERTICAL } from "./imagenes";

let cookie: string;
let cobroId: number;
let seq = 0;
const op = () => `foto-${++seq}-${Date.now()}`;

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
  const cliente = await pedir("/clientes", { metodo: "POST", cuerpo: { nombre: "Cliente con transferencia (ejemplo)" }, cookie });
  const id = cliente.cuerpo.cliente.id;
  await pedir("/fiados", { metodo: "POST", cuerpo: { op_key: op(), cliente_id: id, fecha: "2026-10-12", importe: 100000 }, cookie });
  const cobro = await pedir("/cobros", {
    metodo: "POST",
    cuerpo: { op_key: op(), cliente_id: id, fecha: "2026-10-20", importe: 40000, medio: "transferencia" },
    cookie,
  });
  cobroId = cobro.cuerpo.cobro_id;
});

function subir(bytes: Uint8Array, opciones: { tipo?: string; opKey?: string; ruta?: string; conCookie?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": opciones.tipo ?? "image/jpeg" };
  if (opciones.conCookie !== false) headers.cookie = cookie;
  return app.request(
    `http://localhost/api${opciones.ruta ?? `/comprobantes/cobro/${cobroId}`}?op_key=${opciones.opKey ?? op()}`,
    { method: "POST", headers, body: bytes },
    env,
  );
}

function bajar(id: number, variante: "foto" | "miniatura") {
  return app.request(`http://localhost/api/comprobantes/${id}/${variante}`, { headers: { cookie } }, env);
}

describe("tipo real de la imagen", () => {
  it("reconoce JPEG, PNG y WebP por sus primeros bytes", () => {
    expect(tipoDeImagen(JPEG_APAISADO)).toBe("image/jpeg");
    expect(tipoDeImagen(PNG_VERTICAL)).toBe("image/png");
    expect(tipoDeImagen(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(tipoDeImagen(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(tipoDeImagen(new Uint8Array())).toBeNull();
  });
});

describe("subir una foto", () => {
  it("la guarda achicada (máx. 1.600 px) con su miniatura, y la ficha la muestra", async () => {
    const r = await subir(JPEG_APAISADO);
    expect(r.status).toBe(201);
    const { comprobante: c } = (await r.json()) as { comprobante: { id: number; ancho: number; alto: number; miniatura: boolean } };
    expect(c).toMatchObject({ ancho: 1200, alto: 900, miniatura: true });

    const foto = await bajar(c.id, "foto");
    expect(foto.status).toBe(200);
    expect(foto.headers.get("content-type")).toBe("image/jpeg");
    expect(foto.headers.get("cache-control")).toBe("no-store");
    expect(tipoDeImagen(new Uint8Array(await foto.arrayBuffer()))).toBe("image/jpeg");

    const mini = await bajar(c.id, "miniatura");
    expect(mini.headers.get("content-type")).toBe("image/webp");
    const bytesMini = new Uint8Array(await mini.arrayBuffer());
    expect(tipoDeImagen(bytesMini)).toBe("image/webp");
    const info = await env.IMAGES!.info(new Blob([bytesMini]).stream());
    expect(info).toMatchObject({ width: 320 });

  });

  it("una foto vertical se limita por el alto", async () => {
    const r = await subir(PNG_VERTICAL, { tipo: "image/png" });
    expect(r.status).toBe(201);
    const { comprobante: c } = (await r.json()) as { comprobante: { id: number; ancho: number; alto: number } };
    expect(c).toMatchObject({ ancho: 400, alto: 1600 });
    const foto = new Uint8Array(await (await bajar(c.id, "foto")).arrayBuffer());
    expect(await env.IMAGES!.info(new Blob([foto]).stream())).toMatchObject({ width: 400, height: 1600 });
  });

  it("aparece en la ficha del cliente, en el cobro", async () => {
    const r = await subir(JPEG_APAISADO);
    const { comprobante: c } = (await r.json()) as { comprobante: { id: number } };
    const [fila] = await conBase((db) => db.execute<{ cliente_id: number }>(sql`select cliente_id from cobro where id = ${cobroId}`));
    const ficha = await pedir(`/clientes/${fila!.cliente_id}`, { cookie });
    const item = ficha.cuerpo.historial.find((h: { tipo: string }) => h.tipo === "cobro");
    expect(item.comprobantes).toEqual([{ id: c.id, miniatura: true }]);
  });

  it("el mismo envío dos veces guarda una sola foto (op_key)", async () => {
    const opKey = op();
    expect((await subir(JPEG_APAISADO, { opKey })).status).toBe(201);
    expect((await subir(JPEG_APAISADO, { opKey })).status).toBe(200);
    expect(await conBase((db) => db.select().from(comprobante))).toHaveLength(1);
  });

  it("queda en la auditoría", async () => {
    await subir(JPEG_APAISADO);
    const registros = await conBase((db) => db.select().from(auditoria).where(sql`${auditoria.tabla} = 'comprobante'`));
    expect(registros).toEqual([expect.objectContaining({ accion: "crear" })]);
  });
});

describe("rechazos", () => {
  it("sin sesión no se puede subir ni ver", async () => {
    expect((await subir(JPEG_APAISADO, { conCookie: false })).status).toBe(401);
    expect((await app.request("http://localhost/api/comprobantes/1/foto", {}, env)).status).toBe(401);
  });

  it("algo que no es una foto, aunque diga image/jpeg", async () => {
    const r = await subir(new TextEncoder().encode("<script>alert(1)</script>"));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/no es una foto/i);
  });

  it("un tipo que no es imagen (CSRF: tiene que ser JSON o imagen)", async () => {
    expect((await subir(JPEG_APAISADO, { tipo: "text/plain" })).status).toBe(400);
    expect((await subir(JPEG_APAISADO, { tipo: "multipart/form-data" })).status).toBe(400);
  });

  it("más de 5 MB", async () => {
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set(JPEG_APAISADO.subarray(0, 3));
    expect((await subir(grande)).status).toBe(400);
  });

  it("a un cobro que no existe, a uno anulado o a una tabla que no tiene fotos", async () => {
    expect((await subir(JPEG_APAISADO, { ruta: "/comprobantes/cobro/999999" })).status).toBe(404);
    expect((await subir(JPEG_APAISADO, { ruta: `/comprobantes/cliente/${cobroId}` })).status).toBe(404);
    await pedir(`/cobros/${cobroId}/anular`, { metodo: "POST", cuerpo: { motivo: "Prueba de anulación" }, cookie });
    const r = await subir(JPEG_APAISADO);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/anulado/);
  });
});

describe("anular una foto", () => {
  it("deja de aparecer pero el archivo sigue en R2 y queda el motivo", async () => {
    const r = await subir(JPEG_APAISADO);
    const { comprobante: c } = (await r.json()) as { comprobante: { id: number } };
    const anulada = await pedir(`/comprobantes/${c.id}/anular`, { metodo: "POST", cuerpo: { motivo: "Foto equivocada" }, cookie });
    expect(anulada.estado).toBe(200);
    const [fila] = await conBase((db) => db.select().from(comprobante));
    expect(fila).toMatchObject({ anulado: true, motivo_anulacion: "Foto equivocada" });
    expect(await env.COMPROBANTES!.head(fila!.clave)).not.toBeNull();
    expect((await bajar(c.id, "foto")).status).toBe(200);
  });
});
