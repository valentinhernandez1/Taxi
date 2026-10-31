/**
 * Fechas de negocio en America/Montevideo (regla 10 de CLAUDE.md).
 *
 * Un "día" es un texto AAAA-MM-DD en hora de Uruguay. Los instantes (timestamptz)
 * se guardan en UTC y se convierten al día local con estas funciones; nunca con
 * la zona del servidor, que en Workers es UTC.
 */

export const ZONA_HORARIA = "America/Montevideo";

/** Día calendario en Uruguay, "AAAA-MM-DD". */
export type Dia = string;

const PATRON_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

const formateadorDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formateadorPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function esDia(texto: string): boolean {
  const partes = PATRON_DIA.exec(texto);
  if (!partes) return false;
  const [, a, m, d] = partes.map(Number) as [number, number, number, number];
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function partesDia(dia: Dia): [number, number, number] {
  if (!esDia(dia)) throw new Error(`Día inválido: ${dia}`);
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return [a, m, d];
}

/** Día en Uruguay en que cae un instante. Un viaje a las 23:30 de Uruguay cuenta para ese día (caso 18). */
export function diaEnUruguay(instante: Date): Dia {
  return formateadorDia.format(instante);
}

/** Diferencia en ms entre la hora de Uruguay y UTC en ese instante (−3 h hoy). */
function desfase(instante: Date): number {
  const p: Record<string, number> = {};
  for (const { type, value } of formateadorPartes.formatToParts(instante)) {
    if (type !== "literal") p[type] = Number(value);
  }
  const comoUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Instante UTC en que empieza el día en Uruguay (00:00 local). */
export function inicioDelDia(dia: Dia): Date {
  const [a, m, d] = partesDia(dia);
  const medianocheUtc = Date.UTC(a, m - 1, d);
  let resultado = medianocheUtc - desfase(new Date(medianocheUtc));
  // Segunda pasada por si el desfase cambia ese día (horario de verano histórico).
  resultado = medianocheUtc - desfase(new Date(resultado));
  return new Date(resultado);
}

/** Rango semiabierto [inicio, fin) en UTC que cubre el día en Uruguay. */
export function rangoDelDia(dia: Dia): { desde: Date; hasta: Date } {
  return { desde: inicioDelDia(dia), hasta: inicioDelDia(sumarDias(dia, 1)) };
}

export function sumarDias(dia: Dia, cantidad: number): Dia {
  const [a, m, d] = partesDia(dia);
  return new Date(Date.UTC(a, m - 1, d + cantidad)).toISOString().slice(0, 10);
}

/** Días entre dos fechas (b − a). */
export function diasEntre(a: Dia, b: Dia): number {
  const [aa, am, ad] = partesDia(a);
  const [ba, bm, bd] = partesDia(b);
  return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86_400_000);
}

/** Todos los días desde `desde` hasta `hasta`, ambos incluidos. */
export function diasDelRango(desde: Dia, hasta: Dia): Dia[] {
  const total = diasEntre(desde, hasta);
  if (total < 0) throw new Error(`Rango invertido: ${desde} > ${hasta}`);
  return Array.from({ length: total + 1 }, (_, i) => sumarDias(desde, i));
}

export interface Cobertura {
  completo: boolean;
  diasSinCargar: Dia[];
}

/**
 * Regla 9: si falta algún día del período, el total es "incompleto" (caso 16).
 * `diasConDatos` son los días que tienen al menos un viaje o que el dueño marcó
 * como "no se trabajó".
 */
export function coberturaDelPeriodo(desde: Dia, hasta: Dia, diasConDatos: Iterable<Dia>): Cobertura {
  const cargados = new Set(diasConDatos);
  const diasSinCargar = diasDelRango(desde, hasta).filter((dia) => !cargados.has(dia));
  return { completo: diasSinCargar.length === 0, diasSinCargar };
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-10-18" → "Domingo 18 de octubre". */
export function formatearDiaLargo(dia: Dia): string {
  const [a, m, d] = partesDia(dia);
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[semana]} ${d} de ${MESES[m - 1]}`;
}
