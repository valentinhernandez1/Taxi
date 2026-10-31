import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { AppEnv } from "./env";
import { ErrorNegocio } from "./errores";
import { conBaseDeDatos, soloJson } from "./middleware";
import { rutasAjustes } from "./rutas/ajustes";
import { rutasAuth } from "./rutas/auth";
import { rutasClientes } from "./rutas/clientes";
import { rutasComprobantes } from "./rutas/comprobantes";
import { rutasCoches, rutasPersonas } from "./rutas/flota";
import { rutasCobros, rutasFiados } from "./rutas/movimientos";

export const app = new Hono<AppEnv>().basePath("/api");

app.onError((error, c) => {
  if (error instanceof ErrorNegocio) return c.json({ error: error.message, ...error.datos }, error.estado);
  if (error instanceof ZodError) {
    return c.json({ error: error.issues[0]?.message ?? "Los datos no son válidos" }, 400);
  }
  if (error instanceof SyntaxError) return c.json({ error: "El pedido no es JSON válido" }, 400);
  console.error(error);
  return c.json({ error: "Algo salió mal. Probá de nuevo en un rato." }, 500);
});

app.notFound((c) => c.json({ error: "No existe" }, 404));

// La API solo devuelve JSON: nada se embebe, nada se guarda en caché (son datos de plata).
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    strictTransportSecurity: "max-age=31536000",
    referrerPolicy: "same-origin",
  }),
  async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  },
);

/** Sin base de datos: sirve para ver que el Worker responde. */
app.get("/salud", (c) => c.json({ ok: true }));

app.use("*", soloJson, conBaseDeDatos);
app.route("/auth", rutasAuth);
app.route("/ajustes", rutasAjustes);
app.route("/clientes", rutasClientes);
app.route("/fiados", rutasFiados);
app.route("/cobros", rutasCobros);
app.route("/personas", rutasPersonas);
app.route("/coches", rutasCoches);
app.route("/comprobantes", rutasComprobantes);
