/**
 * Aplica las migraciones de ./drizzle a DATABASE_URL.
 *   pnpm db:migrate
 * Las migraciones se generan con `pnpm db:generate` y se revisan antes de subirlas:
 * nada destructivo sin autorización (CLAUDE.md).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { opcionesConexion } from "../src/db/cliente";
import { urlDeLaBase } from "./entorno";

export async function migrar(url: string): Promise<void> {
  const sql = postgres(url, opcionesConexion());
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = urlDeLaBase();
  await migrar(url);
  console.log(`Migraciones aplicadas en ${new URL(url).host}${new URL(url).pathname}`);
}
