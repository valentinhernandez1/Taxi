/**
 * Reglas de gastos (especificación §4, "Gastos"): vencimientos de los gastos
 * fijos y aguinaldo estimado. Funciones puras, sin base de datos.
 */
import { type Centesimos, centesimos, sumar } from "./dinero";
import { type Dia, esDia } from "./fecha";

export type Frecuencia = "mensual" | "bimestral" | "anual" | "meses_especificos";

export interface PlantillaVencimiento {
  frecuencia: Frecuencia;
  /** Meses 1-12, solo para "meses_especificos". */
  meses: number[] | null;
  dia_del_mes: number;
  /** Primer período que cuenta, "AAAA-MM". */
  primer_periodo: string;
  fecha_fin: Dia | null;
  /** Cantidad de cuotas (por ejemplo, la compra de un coche); nulo = sin fin. */
  cuotas_total: number | null;
}

export interface VencimientoCalculado {
  periodo: string;
  fecha_vence: Dia;
}

const PATRON_PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function esPeriodo(texto: string): boolean {
  return PATRON_PERIODO.test(texto);
}

export function periodoDe(dia: Dia): string {
  return dia.slice(0, 7);
}

export function sumarMeses(periodo: string, cantidad: number): string {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const total = a * 12 + (m - 1) + cantidad;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function diasDelMes(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Día del mes que vence; si el mes es más corto (día 31 en febrero), el último día. */
export function fechaDeVencimiento(periodo: string, diaDelMes: number): Dia {
  return `${periodo}-${String(Math.min(diaDelMes, diasDelMes(periodo))).padStart(2, "0")}`;
}

/**
 * Todos los vencimientos de una plantilla desde su primer período hasta `hasta`
 * (incluido), respetando frecuencia, fecha de fin y cantidad de cuotas.
 */
export function vencimientosHasta(p: PlantillaVencimiento, hasta: Dia): VencimientoCalculado[] {
  if (!esPeriodo(p.primer_periodo)) throw new Error(`Período inválido: ${p.primer_periodo}`);
  if (!esDia(hasta)) throw new Error(`Día inválido: ${hasta}`);
  if (p.dia_del_mes < 1 || p.dia_del_mes > 31) throw new Error("El día del mes va de 1 a 31");
  const mesInicial = Number(p.primer_periodo.slice(5, 7));
  const resultado: VencimientoCalculado[] = [];
  for (let k = 0; ; k++) {
    const periodo = sumarMeses(p.primer_periodo, k);
    if (periodo > periodoDe(hasta)) break;
    const mes = Number(periodo.slice(5, 7));
    const toca =
      p.frecuencia === "mensual" ||
      (p.frecuencia === "bimestral" && k % 2 === 0) ||
      (p.frecuencia === "anual" && mes === mesInicial) ||
      (p.frecuencia === "meses_especificos" && (p.meses ?? []).includes(mes));
    if (!toca) continue;
    const fecha_vence = fechaDeVencimiento(periodo, p.dia_del_mes);
    if (fecha_vence > hasta) break;
    if (p.fecha_fin && fecha_vence > p.fecha_fin) break;
    if (p.cuotas_total != null && resultado.length >= p.cuotas_total) break;
    resultado.push({ periodo, fecha_vence });
  }
  return resultado;
}

export type ConceptoPago = "sueldo" | "jornal" | "adelanto" | "aguinaldo" | "salario_vacacional";

/** Lo que cuenta para el aguinaldo: lo que se le pagó por su trabajo (no el aguinaldo ni el salario vacacional). */
const CUENTA_PARA_AGUINALDO: ReadonlySet<ConceptoPago> = new Set(["sueldo", "jornal", "adelanto"]);

export interface SemestreAguinaldo {
  desde: Dia;
  hasta: Dia;
  /** Mes en que se paga: junio (dic–may) o diciembre (jun–nov). */
  se_paga: "junio" | "diciembre";
}

/** En Uruguay el aguinaldo se genera de diciembre a mayo (se paga en junio) y de junio a noviembre (en diciembre). */
export function semestreAguinaldo(dia: Dia): SemestreAguinaldo {
  const a = Number(dia.slice(0, 4));
  const m = Number(dia.slice(5, 7));
  if (m >= 6 && m <= 11) return { desde: `${a}-06-01`, hasta: `${a}-11-30`, se_paga: "diciembre" };
  const inicio = m === 12 ? a : a - 1;
  return { desde: `${inicio}-12-01`, hasta: fechaDeVencimiento(`${inicio + 1}-05`, 31), se_paga: "junio" };
}

/**
 * Aguinaldo estimado acumulado: la doceava parte de lo pagado en el semestre.
 * Es una estimación (siempre se muestra como "estimado"); lo confirma el contador.
 */
export function aguinaldoEstimado(
  pagos: { concepto: ConceptoPago; importe: Centesimos; fecha: Dia }[],
  dia: Dia,
): SemestreAguinaldo & { base: Centesimos; importe: Centesimos } {
  const semestre = semestreAguinaldo(dia);
  const base = sumar(
    ...pagos
      .filter((p) => CUENTA_PARA_AGUINALDO.has(p.concepto) && p.fecha >= semestre.desde && p.fecha <= semestre.hasta)
      .map((p) => p.importe),
  );
  return { ...semestre, base, importe: centesimos(Math.round(base / 12)) };
}
