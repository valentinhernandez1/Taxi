import type { Db } from "./db/cliente";

export interface Env {
  /** Cadena de conexión: Postgres local en desarrollo, Neon en producción. */
  DATABASE_URL: string;
  /** "development" permite la cookie sin Secure en http://localhost. */
  ENTORNO: "development" | "test" | "production";
  /** Bucket de R2 con las fotos de comprobantes (privado). */
  COMPROBANTES?: R2Bucket;
  /** Cloudflare Images, para normalizar las fotos y sacar miniaturas. */
  IMAGES?: ImagesBinding;
  /** Avisos al celular (Web Push). Sin estas tres, los avisos quedan apagados. */
  VAPID_PUBLICA?: string;
  VAPID_PRIVADA?: string;
  /** "mailto:..." de contacto que piden los servicios de push. */
  VAPID_CONTACTO?: string;
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
