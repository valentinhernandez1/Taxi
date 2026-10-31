/**
 * Corre en Node antes de las pruebas: recrea la base de pruebas vacía y le
 * aplica las migraciones reales. Así cada corrida prueba también las migraciones.
 */
import postgres from "postgres";
import { migrar } from "../scripts/migrar";
import { URL_BASE_PRUEBAS } from "../vitest.config";

export default async function prepararBase(): Promise<void> {
  const url = new URL(URL_BASE_PRUEBAS);
  const nombre = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(nombre)) {
    throw new Error(`Por seguridad la base de pruebas tiene que llamarse *test*: ${nombre}`);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`drop database if exists "${nombre}" with (force)`);
    await sql.unsafe(`create database "${nombre}"`);
  } finally {
    await sql.end();
  }
  await migrar(URL_BASE_PRUEBAS);
}
