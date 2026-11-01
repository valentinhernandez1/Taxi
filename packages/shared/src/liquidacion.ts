/**
 * Liquidación de choferes (especificación §4 "Liquidación"; casos 10, 11 y 12).
 * Función pura: la API la usa para guardar y la web para mostrar la cuenta.
 */
import { aplicarPorcentaje, type Centesimos, centesimos } from "./dinero";

export type TipoLiquidacion = "porcentaje" | "jornal" | "sueldo" | "mixto";
export type ModoEntrega = "entrega_todo" | "se_queda_su_parte";
/** A: su parte de los fiados se le adelanta en la liquidación. B: se le paga cuando el cliente paga. */
export type MomentoFiado = "A" | "B";

export interface ReglaLiquidacion {
  tipo: TipoLiquidacion;
  /** Centésimos de punto: 3000 = 30 %. */
  porcentaje_puntos: number | null;
  jornal: Centesimos | null;
  modo_entrega: ModoEntrega;
  momento_fiado: MomentoFiado;
}

export interface DatosTurno {
  efectivo: Centesimos;
  tarjeta: Centesimos;
  fiado: Centesimos;
  /** Fiados de turnos anteriores (regla B) que el cliente ya pagó: su parte se paga ahora. */
  fiados_cobrados: Centesimos;
  /** Lo que pagó con la plata del turno (combustible, etc.). */
  gastos: Centesimos;
  /** Lo que tiene en mano para entregar antes de liquidar (viajes en efectivo, cobros recibidos…). */
  plata_en_mano: Centesimos;
  /** Fiados incobrables con regla "se descuenta al chofer": su parte adelantada, que se le descuenta. */
  descuentos?: Centesimos;
}

export interface CuentaLiquidacion {
  facturado: Centesimos;
  /** Su parte de los viajes cobrados (efectivo y tarjeta) y el jornal. */
  parte_turno: Centesimos;
  /** Regla A: su parte de los fiados que todavía no se cobraron (se muestra aparte). */
  adelanto_fiados: Centesimos;
  /** Regla B: su parte de los fiados de este turno, que se le paga cuando el cliente pague. */
  pendiente_fiados: Centesimos;
  /** Regla B: su parte de fiados viejos que ya se cobraron. */
  parte_fiados_cobrados: Centesimos;
  /** Lo que se le descuenta por fiados incobrables. */
  descuentos: Centesimos;
  /** Todo lo que se le paga en esta liquidación (ya descontado). */
  parte_total: Centesimos;
  /**
   * Lo que te tiene que entregar: plata en mano − gastos − su parte.
   * Negativo: la empresa le tiene que pagar la diferencia.
   */
  esperado: Centesimos;
}

function porcentaje(regla: ReglaLiquidacion): number {
  if (regla.tipo !== "porcentaje" && regla.tipo !== "mixto") return 0;
  if (regla.porcentaje_puntos == null) throw new Error("A esta regla le falta el porcentaje");
  return regla.porcentaje_puntos;
}

function jornal(regla: ReglaLiquidacion): Centesimos {
  if (regla.tipo !== "jornal" && regla.tipo !== "mixto") return centesimos(0);
  if (regla.jornal == null) throw new Error("A esta regla le falta el jornal");
  return regla.jornal;
}

/** Su parte de un importe con un porcentaje (por ejemplo, la de un fiado viejo que ya se cobró). */
export function parteDe(importe: Centesimos, porcentajePuntos: number): Centesimos {
  return aplicarPorcentaje(importe, porcentajePuntos);
}

export function calcularLiquidacion(regla: ReglaLiquidacion, t: DatosTurno): CuentaLiquidacion {
  const pct = porcentaje(regla);
  const facturado = centesimos(t.efectivo + t.tarjeta + t.fiado);
  const parteFiados = aplicarPorcentaje(t.fiado, pct);
  const parte_turno = centesimos(aplicarPorcentaje(centesimos(t.efectivo + t.tarjeta), pct) + jornal(regla));
  const adelanto_fiados = regla.momento_fiado === "A" ? parteFiados : centesimos(0);
  const pendiente_fiados = regla.momento_fiado === "B" ? parteFiados : centesimos(0);
  const descuentos = t.descuentos ?? centesimos(0);
  const parte_total = centesimos(parte_turno + adelanto_fiados + t.fiados_cobrados - descuentos);
  return {
    facturado,
    parte_turno,
    adelanto_fiados,
    pendiente_fiados,
    parte_fiados_cobrados: t.fiados_cobrados,
    descuentos,
    parte_total,
    esperado: centesimos(t.plata_en_mano - t.gastos - parte_total),
  };
}

/** "Cobra el 30 % de todo lo que hizo, fiados incluidos, y se queda con su parte." */
export function describirRegla(regla: ReglaLiquidacion, formatear: (c: Centesimos) => string): string {
  const pct = regla.porcentaje_puntos == null ? "" : `${(regla.porcentaje_puntos / 100).toLocaleString("es-UY")} %`;
  const cobro =
    regla.tipo === "porcentaje"
      ? `Cobra el ${pct} de lo que hace`
      : regla.tipo === "jornal"
        ? `Cobra ${formatear(regla.jornal ?? centesimos(0))} por turno`
        : regla.tipo === "mixto"
          ? `Cobra ${formatear(regla.jornal ?? centesimos(0))} por turno más el ${pct} de lo que hace`
          : "Cobra sueldo (se paga en Empleados y pagos)";
  const fiados =
    regla.tipo === "sueldo" || regla.tipo === "jornal"
      ? ""
      : regla.momento_fiado === "A"
        ? ", fiados incluidos (se le adelanta su parte)"
        : "; su parte de los fiados, cuando el cliente pague";
  const entrega = regla.modo_entrega === "se_queda_su_parte" ? " y se queda con su parte." : ". Entrega todo y se le paga su parte.";
  return `${cobro}${fiados}${entrega}`;
}
