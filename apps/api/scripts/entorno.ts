import { existsSync, readFileSync } from "node:fs";

/** Lee DATABASE_URL del entorno o del .env de la raíz del repo. */
export function urlDeLaBase(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const archivo = new URL("../../../.env", import.meta.url);
  if (existsSync(archivo)) {
    for (const linea of readFileSync(archivo, "utf8").split("\n")) {
      const coincide = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(linea);
      if (coincide?.[1]) return coincide[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("Falta DATABASE_URL (en el entorno o en .env). Mirá .env.example.");
}
