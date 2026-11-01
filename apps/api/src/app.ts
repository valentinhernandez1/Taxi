import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { AppEnv } from "./env";
import { ErrorNegocio } from "./errores";
import { conBaseDeDatos, soloJson } from "./middleware";
import { rutasAjustes } from "./rutas/ajustes";
import { rutasAuth } from "./rutas/auth";
import { rutasClientes } from "./rutas/clientes";
import { rutasViajes } from "./rutas/viajes";
import { rutasPanel } from "./rutas/panel";
import { rutasTurnos } from "./rutas/turnos";
import { rutasChoferes, rutasLiquidaciones, rutasReglas } from "./rutas/liquidacion";
import { rutasCategorias, rutasEmpleados, rutasFichaCoche, rutasGastos, rutasGastosFijos, rutasVencimientos } from "./rutas/gastos";
import { rutasPlata } from "./rutas/plata";
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
app.route("/viajes", rutasViajes);
app.route("/plata", rutasPlata);
app.route("/gastos", rutasGastos);
app.route("/categorias", rutasCategorias);
app.route("/gastos-fijos", rutasGastosFijos);
app.route("/vencimientos", rutasVencimientos);
app.route("/empleados", rutasEmpleados);
app.route("/ficha-coche", rutasFichaCoche);
app.route("/choferes", rutasChoferes);
app.route("/reglas", rutasReglas);
app.route("/liquidaciones", rutasLiquidaciones);
app.route("/panel", rutasPanel);
app.route("/turnos", rutasTurnos);
