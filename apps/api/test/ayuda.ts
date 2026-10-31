import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { app } from "../src/app";
import { hashearPassword } from "../src/auth/password";
import { conectar, type Db } from "../src/db/cliente";
import { usuario } from "../src/db/schema";

export const EMAIL_DUENO = "dueno@ejemplo.uy";
export const PASSWORD_DUENO = "una frase larga de ejemplo";

/** Corre una función con una conexión propia a la base de pruebas. */
export async function conBase<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const { db, cerrar } = conectar(env.DATABASE_URL);
  try {
    return await fn(db);
  } finally {
    await cerrar();
  }
}

export async function limpiarBase(): Promise<void> {
  await conBase(async (db) => {
    const rows = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    );
    const tablas = rows.map((r) => `"${r.tablename}"`).join(", ");
    if (tablas) await db.execute(sql.raw(`truncate ${tablas} restart identity cascade`));
  });
}

export async function crearDueno(password = PASSWORD_DUENO): Promise<number> {
  return conBase(async (db) => {
    const [fila] = await db
      .insert(usuario)
      .values({ email: EMAIL_DUENO, hash_password: await hashearPassword(password), rol: "dueno" })
      .returning({ id: usuario.id });
    return fila!.id;
  });
}

export interface Pedido {
  metodo?: string;
  cuerpo?: unknown;
  cookie?: string;
  cabeceras?: Record<string, string>;
}

export async function pedir(ruta: string, { metodo = "GET", cuerpo, cookie, cabeceras = {} }: Pedido = {}) {
  const headers: Record<string, string> = { ...cabeceras };
  if (cuerpo !== undefined) headers["content-type"] ??= "application/json";
  if (cookie) headers.cookie = cookie;
  const respuesta = await app.request(
    `http://localhost/api${ruta}`,
    { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) },
    env,
  );
  const texto = await respuesta.text();
  return {
    estado: respuesta.status,
    cuerpo: (texto ? JSON.parse(texto) : null) as Record<string, any>,
    setCookie: respuesta.headers.get("set-cookie"),
  };
}

/** Entra como el dueño y devuelve la cookie "sesion=…" para los pedidos siguientes. */
export async function entrar(password = PASSWORD_DUENO): Promise<string> {
  const r = await pedir("/auth/login", { metodo: "POST", cuerpo: { email: EMAIL_DUENO, password } });
  if (r.estado !== 200 || !r.setCookie) throw new Error(`No pudo entrar: ${r.estado} ${JSON.stringify(r.cuerpo)}`);
  return r.setCookie.split(";")[0]!;
}
