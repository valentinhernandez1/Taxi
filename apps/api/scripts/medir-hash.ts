/**
 * Mide cuánto tarda PBKDF2-SHA256 dentro de workerd (el runtime de Cloudflare)
 * para elegir ITERACIONES_PBKDF2 sin pasarse de los 10 ms de CPU del plan gratis.
 *
 *   pnpm --filter @taxis/api medir-hash
 *
 * Dentro de un Worker el reloj no avanza mientras se calcula, así que se mide
 * desde afuera: tiempo de cada pedido menos el de un pedido casi vacío. El
 * cálculo no hace I/O, así que ese tiempo es CPU. El hardware de Cloudflare
 * puede ser más lento o más rápido que esta máquina: se deja margen.
 */
import { Miniflare } from "miniflare";
import { ITERACIONES_PBKDF2 } from "../src/auth/password";

const PRESUPUESTO_MS = 10;
const REPETICIONES = 25;
const CANDIDATOS = [1, 5_000, 10_000, 20_000, 30_000, 50_000, 100_000];

// Misma llamada que src/auth/password.ts (importKey + deriveBits de 256 bits).
const script = /* js */ `
export default {
  async fetch(request) {
    const iteraciones = Number(new URL(request.url).searchParams.get("i"));
    const clave = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode("una contraseña de ejemplo larga"), "PBKDF2", false, ["deriveBits"]);
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: crypto.getRandomValues(new Uint8Array(16)), iterations: iteraciones },
      clave, 256);
    return new Response("ok");
  },
};`;

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)]!;
}

async function medir(mf: Miniflare, iteraciones: number): Promise<number> {
  const tiempos: number[] = [];
  for (let i = 0; i < REPETICIONES + 3; i++) {
    const inicio = performance.now();
    const respuesta = await mf.dispatchFetch(`http://medir/?i=${iteraciones}`);
    await respuesta.text();
    if (i >= 3) tiempos.push(performance.now() - inicio); // los primeros calientan
  }
  return mediana(tiempos);
}

const mf = new Miniflare({ modules: true, script, compatibilityDate: "2025-10-01" });
try {
  const base = await medir(mf, 1);
  console.log(`Pedido vacío: ${base.toFixed(2)} ms (se descuenta)\n`);
  console.log("Iteraciones  CPU aprox.  ¿Entra en 10 ms con margen 2x?");
  for (const iteraciones of CANDIDATOS.slice(1)) {
    const neto = Math.max(0, (await medir(mf, iteraciones)) - base);
    const entra = neto * 2 <= PRESUPUESTO_MS ? "sí" : "no";
    const marca = iteraciones === ITERACIONES_PBKDF2 ? "  ← actual" : "";
    console.log(`${String(iteraciones).padStart(11)}  ${neto.toFixed(2).padStart(7)} ms  ${entra}${marca}`);
  }
} finally {
  await mf.dispose();
}
