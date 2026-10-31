import type { Db } from "./db/cliente";

export interface Env {
  /** Cadena de conexión: Postgres local en desarrollo, Neon en producción. */
  DATABASE_URL: string;
  /** "development" permite la cookie sin Secure en http://localhost. */
  ENTORNO: "development" | "test" | "production";
}

export interface UsuarioActual {
  id: number;
  email: string;
  rol: "dueno" | "telefonista" | "chofer";
}

export interface Variables {
  db: Db;
  usuario: UsuarioActual;
  sesionHash: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: Variables;
}
