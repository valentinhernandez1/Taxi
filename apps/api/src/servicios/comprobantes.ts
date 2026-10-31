/**
 * Fotos de comprobantes: el archivo en R2, el registro en `comprobante`.
 *
 * Para quedar dentro de lo gratis de Cloudflare Images (5.000 transformaciones
 * distintas por mes; pasado eso no cobra, da error):
 * - El celular ya achica la foto antes de subirla.
 * - Al subir se usa Images una sola vez por foto: una copia normalizada (sin
 *   datos ocultos como el GPS) y una miniatura. Las dos quedan en R2 y verlas
 *   después no vuelve a usar Images.
 * - Si Images falla, se guarda la foto tal cual y sin miniatura.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db, DbOTx } from "../db/cliente";
import { cobro, comprobante, gasto } from "../db/schema";
import type { Env } from "../env";
import { ErrorNegocio } from "../errores";
import { registrarAuditoria } from "./auditoria";

export const MAXIMO_BYTES = 5 * 1024 * 1024;
const LADO_GRANDE = 1600;
const LADO_MINIATURA = 320;

export type TablaConComprobante = "cobro" | "gasto";

/** Tipo real de la imagen según sus primeros bytes; null si no es JPEG, PNG ni WebP. */
export function tipoDeImagen(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) return "image/png";
  const ascii = (desde: number, hasta: number) => String.fromCharCode(...bytes.subarray(desde, hasta));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

function bindings(env: Env): { r2: R2Bucket; images: ImagesBinding | undefined } {
  if (!env.COMPROBANTES) throw new ErrorNegocio("Las fotos de comprobantes todavía no están activadas.", 400);
  return { r2: env.COMPROBANTES, images: env.IMAGES };
}

function flujo(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

async function aBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Procesada {
  grande: { bytes: Uint8Array; tipo: string; ancho: number | null; alto: number | null };
  miniatura: { bytes: Uint8Array; tipo: string } | null;
}

/** Normaliza y saca la miniatura con Images. Si Images no está o falla, devuelve la original. */
async function procesar(images: ImagesBinding | undefined, bytes: Uint8Array, tipo: string): Promise<Procesada> {
  const original: Procesada = { grande: { bytes, tipo, ancho: null, alto: null }, miniatura: null };
  if (!images) return original;

  let ancho: number;
  let alto: number;
  try {
    const info = await images.info(flujo(bytes)); // gratis, no cuenta como transformación
    if (!("width" in info) || !info.width || !info.height) throw new ErrorNegocio("No es una foto válida.");
    ancho = info.width;
    alto = info.height;
  } catch (error) {
    if (error instanceof ErrorNegocio) throw error;
    throw new ErrorNegocio("No se pudo leer la foto. Probá sacarla de nuevo.");
  }

  // Se limita el lado más largo; nunca se agranda.
  const escala = (lado: number) => Math.min(1, lado / Math.max(ancho, alto));
  const medida = (lado: number) =>
    ancho >= alto ? { width: Math.round(ancho * escala(lado)) } : { height: Math.round(alto * escala(lado)) };

  try {
    const grande = await images.input(flujo(bytes)).transform(medida(LADO_GRANDE)).output({ format: "image/jpeg", quality: 80 });
    const mini = await images.input(flujo(bytes)).transform(medida(LADO_MINIATURA)).output({ format: "image/webp", quality: 75 });
    return {
      grande: {
        bytes: await aBytes(grande.image()),
        tipo: grande.contentType(),
        ancho: Math.round(ancho * escala(LADO_GRANDE)),
        alto: Math.round(alto * escala(LADO_GRANDE)),
      },
      miniatura: { bytes: await aBytes(mini.image()), tipo: mini.contentType() },
    };
  } catch (error) {
    console.warn("Images no pudo procesar la foto; se guarda sin miniatura", error);
    return { ...original, grande: { ...original.grande, ancho, alto } };
  }
}

async function registroExiste(db: DbOTx, tabla: TablaConComprobante, id: number): Promise<void> {
  const t = tabla === "cobro" ? cobro : gasto;
  const [fila] = await db.select({ anulado: t.anulado }).from(t).where(eq(t.id, id));
  if (!fila) throw new ErrorNegocio(tabla === "cobro" ? "Ese cobro no existe" : "Ese gasto no existe", 404);
  if (fila.anulado) throw new ErrorNegocio("No se agregan fotos a algo anulado.");
}

export interface DatosSubida {
  tabla: TablaConComprobante;
  registroId: number;
  opKey: string;
  bytes: Uint8Array;
}

export async function subirComprobante(db: Db, env: Env, usuarioId: number, datos: DatosSubida) {
  const { r2, images } = bindings(env);
  const [ya] = await db.select().from(comprobante).where(eq(comprobante.op_key, datos.opKey));
  if (ya) return { comprobante: ya, repetido: true };

  if (datos.bytes.length === 0) throw new ErrorNegocio("La foto llegó vacía. Probá de nuevo.");
  if (datos.bytes.length > MAXIMO_BYTES) throw new ErrorNegocio("La foto es demasiado grande (máximo 5 MB).");
  const tipo = tipoDeImagen(datos.bytes);
  if (!tipo) throw new ErrorNegocio("Eso no es una foto. Se aceptan JPEG, PNG o WebP.");
  await registroExiste(db, datos.tabla, datos.registroId);

  const procesada = await procesar(images, datos.bytes, tipo);
  const base = `comprobantes/${datos.tabla}/${datos.registroId}/${crypto.randomUUID()}`;
  const extension = procesada.grande.tipo === "image/png" ? "png" : procesada.grande.tipo === "image/webp" ? "webp" : "jpg";
  const clave = `${base}.${extension}`;
  const claveMiniatura = procesada.miniatura ? `${base}-mini.webp` : null;

  await r2.put(clave, procesada.grande.bytes, { httpMetadata: { contentType: procesada.grande.tipo } });
  if (procesada.miniatura && claveMiniatura) {
    await r2.put(claveMiniatura, procesada.miniatura.bytes, { httpMetadata: { contentType: procesada.miniatura.tipo } });
  }

  const nuevo = await db.transaction(async (tx) => {
    await registroExiste(tx, datos.tabla, datos.registroId);
    const [fila] = await tx
      .insert(comprobante)
      .values({
        tabla: datos.tabla,
        registro_id: datos.registroId,
        clave,
        clave_miniatura: claveMiniatura,
        tipo: procesada.grande.tipo,
        bytes: procesada.grande.bytes.length,
        ancho: procesada.grande.ancho,
        alto: procesada.grande.alto,
        op_key: datos.opKey,
      })
      .returning();
    await registrarAuditoria(tx, {
      tabla: "comprobante",
      registroId: fila!.id,
      accion: "crear",
      despues: { tabla: datos.tabla, registro_id: datos.registroId, clave, bytes: fila!.bytes, miniatura: Boolean(claveMiniatura) },
      usuarioId,
    });
    return fila!;
  });
  return { comprobante: nuevo, repetido: false };
}

export async function leerComprobante(db: Db, env: Env, id: number, variante: "foto" | "miniatura") {
  const { r2 } = bindings(env);
  const [fila] = await db.select().from(comprobante).where(eq(comprobante.id, id));
  if (!fila) throw new ErrorNegocio("Esa foto no existe", 404);
  const clave = variante === "miniatura" ? (fila.clave_miniatura ?? fila.clave) : fila.clave;
  const objeto = await r2.get(clave);
  if (!objeto) throw new ErrorNegocio("No se encontró el archivo de la foto", 404);
  return { cuerpo: objeto.body, tipo: objeto.httpMetadata?.contentType ?? fila.tipo };
}

/** Fotos vigentes de varios registros, para mostrarlas en la ficha. */
export async function comprobantesDe(db: DbOTx, tabla: TablaConComprobante, ids: number[]) {
  if (ids.length === 0) return new Map<number, { id: number; miniatura: boolean }[]>();
  const filas = await db
    .select({ id: comprobante.id, registro_id: comprobante.registro_id, clave_miniatura: comprobante.clave_miniatura })
    .from(comprobante)
    .where(and(eq(comprobante.tabla, tabla), inArray(comprobante.registro_id, ids), eq(comprobante.anulado, false)))
    .orderBy(comprobante.id);
  const porRegistro = new Map<number, { id: number; miniatura: boolean }[]>();
  for (const f of filas) {
    const lista = porRegistro.get(f.registro_id) ?? [];
    lista.push({ id: f.id, miniatura: f.clave_miniatura !== null });
    porRegistro.set(f.registro_id, lista);
  }
  return porRegistro;
}

/** Nada se borra (regla 6): la foto queda en R2 y se marca anulada con motivo. */
export async function anularComprobante(db: Db, usuarioId: number, id: number, motivo: string) {
  return db.transaction(async (tx) => {
    const [fila] = await tx.select().from(comprobante).where(eq(comprobante.id, id)).for("update");
    if (!fila) throw new ErrorNegocio("Esa foto no existe", 404);
    if (fila.anulado) return { ok: true };
    await tx.update(comprobante).set({ anulado: true, anulado_en: new Date(), motivo_anulacion: motivo }).where(eq(comprobante.id, id));
    await registrarAuditoria(tx, { tabla: "comprobante", registroId: id, accion: "anular", antes: { anulado: false }, despues: { anulado: true }, motivo, usuarioId });
    return { ok: true };
  });
}
