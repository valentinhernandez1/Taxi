/**
 * Carga datos-ejemplo.sql en DATABASE_URL (sin necesitar psql; anda en Windows).
 *   pnpm db:ejemplo
 * Solo sobre una base recién migrada y sin datos: si ya hay clientes, no hace nada.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { normalizarUrl, opcionesConexion } from "../src/db/cliente";
import { urlDeLaBase } from "./entorno";

const sql = postgres(normalizarUrl(urlDeLaBase()), opcionesConexion());
try {
  const [fila] = await sql<{ n: number }[]>`select count(*)::int as n from cliente`;
  if ((fila?.n ?? 0) > 0) {
    console.log("La base ya tiene clientes: no se cargan datos de ejemplo.");
  } else {
    await sql.unsafe(readFileSync(new URL("./datos-ejemplo.sql", import.meta.url), "utf8"));
    console.log("Datos de ejemplo cargados.");
  }
} finally {
  await sql.end();
}
