/**
 * Dinero en enteros de centésimos. Nunca float (regla 7 de CLAUDE.md).
 *
 * - En la base: NUMERIC(12,2), que el driver devuelve como texto ("1250.00").
 * - En el código: `Centesimos` (entero). $ 1.250,00 = 125000.
 */

declare const marca: unique symbol;
export type Centesimos = number & { readonly [marca]: "Centesimos" };

/** Máximo que entra en NUMERIC(12,2): 9.999.999.999,99. */
export const MAXIMO_CENTESIMOS = 999_999_999_999;

export class ErrorImporte extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorImporte";
  }
}

export function centesimos(valor: number): Centesimos {
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorImporte(`No es un entero de centésimos: ${valor}`);
  }
  if (Math.abs(valor) > MAXIMO_CENTESIMOS) {
    throw new ErrorImporte("El importe es demasiado grande");
  }
  return valor as Centesimos;
}

export const CERO = centesimos(0);

export function sumar(...importes: Centesimos[]): Centesimos {
  let total = 0;
  for (const importe of importes) total += importe;
  return centesimos(total);
}

export function restar(a: Centesimos, b: Centesimos): Centesimos {
  return centesimos(a - b);
}

/**
 * Aplica un porcentaje expresado en centésimos de punto (300 = 3 %, 3000 = 30 %).
 * Redondea al centésimo más cercano, mitades hacia arriba en valor absoluto.
 * Usa BigInt para que el producto intermedio no pierda precisión.
 */
export function aplicarPorcentaje(importe: Centesimos, puntosBasicos: number): Centesimos {
  if (!Number.isSafeInteger(puntosBasicos)) {
    throw new ErrorImporte(`Porcentaje inválido: ${puntosBasicos}`);
  }
  const producto = BigInt(importe) * BigInt(puntosBasicos);
  const negativo = producto < 0n;
  const absoluto = negativo ? -producto : producto;
  const redondeado = (absoluto + 5_000n) / 10_000n;
  return centesimos(Number(negativo ? -redondeado : redondeado));
}

const PATRON_NUMERIC = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "1250.5" o "1250.50" (como lo devuelve Postgres) → 125050. */
export function desdeNumeric(texto: string): Centesimos {
  const partes = PATRON_NUMERIC.exec(texto.trim());
  if (!partes) throw new ErrorImporte(`Valor NUMERIC inválido: ${texto}`);
  const [, signo, enteros = "0", decimales = ""] = partes;
  const valor = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
  return centesimos(signo ? -valor : valor);
}

/** 125050 → "1250.50", listo para una columna NUMERIC(12,2). */
export function aNumeric(importe: Centesimos): string {
  const negativo = importe < 0;
  const absoluto = Math.abs(importe);
  const enteros = Math.trunc(absoluto / 100);
  const decimales = String(absoluto % 100).padStart(2, "0");
  return `${negativo ? "-" : ""}${enteros}.${decimales}`;
}

/**
 * Lee lo que escribe el dueño: "1250", "1.250", "1250,5", "1.250,50", "$ 1.250".
 * La coma es el separador decimal (Uruguay). El punto se acepta como separador de
 * miles solo si agrupa de a tres cifras; si no, se toma como decimal ("10.5").
 * Rechaza más de 2 decimales en vez de redondear (caso 6 de la especificación).
 */
export function parsearImporte(texto: string): Centesimos {
  let limpio = texto.trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (limpio === "") throw new ErrorImporte("Escribí un importe");

  let negativo = false;
  if (limpio.startsWith("-") || limpio.startsWith("−")) {
    negativo = true;
    limpio = limpio.slice(1);
  }

  let enteros: string;
  let decimales = "";
  if (limpio.includes(",")) {
    const [izquierda = "", derecha = "", ...resto] = limpio.split(",");
    if (resto.length > 0) throw new ErrorImporte("El importe tiene más de una coma");
    enteros = quitarPuntosDeMiles(izquierda);
    decimales = derecha;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    enteros = limpio.replaceAll(".", "");
  } else {
    const [izquierda = "", derecha = "", ...resto] = limpio.split(".");
    if (resto.length > 0) throw new ErrorImporte("No se entiende el importe");
    enteros = izquierda;
    decimales = derecha;
  }

  if (enteros === "") enteros = "0";
  if (!/^\d+$/.test(enteros) || !/^\d*$/.test(decimales)) {
    throw new ErrorImporte("El importe solo puede tener números");
  }
  if (decimales.length > 2) {
    throw new ErrorImporte("El importe no puede tener más de 2 decimales");
  }
  if (enteros.length > 10) throw new ErrorImporte("El importe es demasiado grande");

  const valor = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
  return centesimos(negativo ? -valor : valor);
}

function quitarPuntosDeMiles(texto: string): string {
  if (!texto.includes(".")) return texto;
  if (!/^\d{1,3}(\.\d{3})+$/.test(texto)) {
    throw new ErrorImporte("Los puntos de miles están mal puestos");
  }
  return texto.replaceAll(".", "");
}

/** Importe que se puede anotar: mayor que cero (caso 6). */
export function validarImportePositivo(importe: Centesimos): Centesimos {
  if (importe <= 0) throw new ErrorImporte("El importe tiene que ser mayor que cero");
  return importe;
}

export const MONEDAS = {
  UYU: { simbolo: "$" },
  USD: { simbolo: "US$" },
} as const;
export type Moneda = keyof typeof MONEDAS;

/** Centésimos de punto → texto sin el signo: 300 → "3", 350 → "3,5", 1234 → "12,34". */
export function formatearPorcentaje(puntosBasicos: number): string {
  const entero = Math.trunc(Math.abs(puntosBasicos) / 100);
  const decimales = String(Math.abs(puntosBasicos) % 100).padStart(2, "0").replace(/0+$/, "");
  return `${puntosBasicos < 0 ? "-" : ""}${entero}${decimales ? `,${decimales}` : ""}`;
}

/** 125000 → "$ 1.250,00". Negativo: "-$ 1.250,00". */
export function formatearImporte(
  importe: Centesimos,
  opciones: { moneda?: Moneda; sinDecimales?: boolean } = {},
): string {
  const { simbolo } = MONEDAS[opciones.moneda ?? "UYU"];
  const negativo = importe < 0;
  const absoluto = Math.abs(importe);
  const enteros = String(Math.trunc(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimales = String(absoluto % 100).padStart(2, "0");
  const cuerpo = opciones.sinDecimales && decimales === "00" ? enteros : `${enteros},${decimales}`;
  return `${negativo ? "-" : ""}${simbolo} ${cuerpo}`;
}
