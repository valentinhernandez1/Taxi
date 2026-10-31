/**
 * Aplica las migraciones de ./drizzle a DATABASE_URL.
 *   pnpm db:migrate
 * Las migraciones se generan con `pnpm db:generate` y se revisan antes de subirlas:
 * nada destructivo sin autorización (CLAUDE.md).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizarUrl, opcionesConexion } from "../src/db/cliente";
import { urlDeLaBase } from "./entorno";

export async function migrar(url: string): Promise<void> {
  const sql = postgres(normalizarUrl(url), opcionesConexion());
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await sql.end();
  }
}

// Comparar como URL: en Windows argv[1] es "C:\\..." y no "file:///C:/...".
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = urlDeLaBase();
  await migrar(url);
  console.log(`Migraciones aplicadas en ${new URL(url).host}${new URL(url).pathname}`);
}
