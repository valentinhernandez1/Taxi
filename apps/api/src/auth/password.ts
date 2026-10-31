/**
 * Hash de contraseña con PBKDF2-SHA256 de WebCrypto: está en Workers y en Node
 * sin dependencias, y corre en código nativo.
 *
 * Límites que mandan:
 * - Workers rechaza PBKDF2 con más de 100.000 iteraciones.
 * - El plan gratis da 10 ms de CPU por pedido.
 * Las iteraciones salen de medirlas (`pnpm --filter @taxis/api medir-hash`, ver README).
 * Como la cantidad va guardada en cada hash, se puede subir más adelante y
 * rehashear en el próximo login sin invalidar nada.
 */

export const ITERACIONES_PBKDF2 = 20_000;
export const MAXIMO_ITERACIONES_WORKERS = 100_000;

const ALGORITMO = "pbkdf2-sha256";
const BYTES_SAL = 16;
const BITS_HASH = 256;

const codificador = new TextEncoder();

function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

function desdeBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function derivar(password: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey("raw", codificador.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sal as BufferSource, iterations: iteraciones },
    clave,
    BITS_HASH,
  );
  return new Uint8Array(bits);
}

/** Devuelve "pbkdf2-sha256$<iteraciones>$<sal>$<hash>" (base64). */
export async function hashearPassword(
  password: string,
  iteraciones: number = ITERACIONES_PBKDF2,
): Promise<string> {
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > MAXIMO_ITERACIONES_WORKERS) {
    throw new Error(`Iteraciones fuera de rango: ${iteraciones}`);
  }
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(password, sal, iteraciones);
  return `${ALGORITMO}$${iteraciones}$${aBase64(sal)}$${aBase64(hash)}`;
}

function igualesEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i]! ^ b[i]!;
  return diferencia === 0;
}

export interface ResultadoVerificacion {
  valida: boolean;
  /** El hash usa menos iteraciones que las actuales: conviene rehashear. */
  rehashear: boolean;
}

export async function verificarPassword(password: string, guardado: string): Promise<ResultadoVerificacion> {
  const [algoritmo, textoIteraciones, sal, hash, ...resto] = guardado.split("$");
  const iteraciones = Number(textoIteraciones);
  if (
    algoritmo !== ALGORITMO ||
    !sal ||
    !hash ||
    resto.length > 0 ||
    !Number.isInteger(iteraciones) ||
    iteraciones < 1 ||
    iteraciones > MAXIMO_ITERACIONES_WORKERS
  ) {
    return { valida: false, rehashear: false };
  }
  const calculado = await derivar(password, desdeBase64(sal), iteraciones);
  const valida = igualesEnTiempoConstante(calculado, desdeBase64(hash));
  return { valida, rehashear: valida && iteraciones < ITERACIONES_PBKDF2 };
}

/**
 * Hash de relleno para cuando el email no existe: se verifica igual contra él
 * para que la respuesta tarde lo mismo y no delate qué emails están registrados.
 */
export const HASH_DE_RELLENO = `${ALGORITMO}$${ITERACIONES_PBKDF2}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
