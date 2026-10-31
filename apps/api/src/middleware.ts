import { createMiddleware } from "hono/factory";
import { buscarSesion, leerCookie } from "./auth/sesion";
import { conectar } from "./db/cliente";
import type { AppEnv } from "./env";
import { ErrorNegocio } from "./errores";

/** Una conexión a la base por pedido, cerrada siempre al final. */
export const conBaseDeDatos = createMiddleware<AppEnv>(async (c, next) => {
  const { db, cerrar } = conectar(c.env.DATABASE_URL);
  c.set("db", db);
  try {
    await next();
  } finally {
    await cerrar();
  }
});

/**
 * Defensa CSRF junto con la cookie SameSite=Strict: los pedidos que cambian algo
 * tienen que ser JSON, algo que un formulario de otro sitio no puede mandar sin
 * permiso del navegador.
 */
export const soloJson = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS") {
    const tipo = (c.req.header("content-type") ?? "").toLowerCase();
    // La subida de fotos manda la imagen tal cual: un formulario de otro sitio
    // tampoco puede mandar estos tipos sin permiso del navegador.
    const esFoto = /^\/api\/comprobantes\/[a-z]+\/\d+$/.test(c.req.path) && /^image\/(jpeg|png|webp)$/.test(tipo);
    if (!tipo.startsWith("application/json") && !esFoto) {
      throw new ErrorNegocio("El pedido tiene que ser JSON", 400);
    }
  }
  await next();
});

export const requiereSesion = createMiddleware<AppEnv>(async (c, next) => {
  const token = leerCookie(c);
  const encontrada = token ? await buscarSesion(c.var.db, token) : null;
  if (!encontrada) throw new ErrorNegocio("Tenés que entrar de nuevo", 401);
  c.set("usuario", encontrada.usuario);
  c.set("sesionHash", encontrada.hash);
  await next();
});

export const soloDueno = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.usuario.rol !== "dueno") throw new ErrorNegocio("Esto lo puede hacer solo el dueño", 403);
  await next();
});
