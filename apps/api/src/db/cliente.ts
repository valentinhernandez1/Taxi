/**
 * Conexión a Postgres con postgres.js sobre los sockets TCP de Workers
 * (`nodejs_compat`). Es protocolo Postgres estándar: el mismo código habla con
 * el Postgres local de Docker y con Neon. Una conexión por pedido, cerrada al
 * terminar, como recomienda Cloudflare sin Hyperdrive.
 *
 * Si más adelante conviene el driver serverless de Neon (HTTP/WebSocket), se
 * cambia solo este archivo: Drizzle expone la misma API.
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** Transacción o conexión: los servicios aceptan cualquiera de las dos. */
export type DbOTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export function opcionesConexion(): postgres.Options<Record<string, never>> {
  return {
    max: 1,
    // El pooler de Neon (PgBouncer en modo transacción) no soporta sentencias preparadas.
    prepare: false,
    // Las fechas de negocio se calculan en código con America/Montevideo; la
    // sesión en UTC evita que un `now()::date` dependa de la zona del servidor.
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  };
}

export function conectar(url: string): { db: Db; cerrar: () => Promise<void> } {
  const sql = postgres(url, opcionesConexion());
  return {
    db: drizzle(sql, { schema }),
    cerrar: () => sql.end({ timeout: 5 }),
  };
}
