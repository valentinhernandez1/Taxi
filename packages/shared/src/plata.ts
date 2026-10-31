/**
 * Reglas de "Dónde está la plata" (especificación §4): entregas de las
 * personas que tienen plata y acreditaciones de Handy.
 */
import { aplicarPorcentaje, type Centesimos, restar } from "./dinero";

/**
 * Caso 8: una persona tenía que entregar `esperado` y entregó `entregado`.
 * La diferencia (positiva = faltó plata, negativa = entregó de más) queda
 * registrada y su saldo vuelve a cero.
 */
export function diferenciaDeEntrega(esperado: Centesimos, entregado: Centesimos): Centesimos {
  return restar(esperado, entregado);
}

/** Comisión de Handy que se espera, para mostrar antes de que caiga al banco. */
export function comisionHandyEstimada(aAcreditar: Centesimos, puntosBasicos: number): Centesimos {
  return aplicarPorcentaje(aAcreditar, puntosBasicos);
}

/**
 * Caso 9: había `esperado` con tarjeta y al banco cayó `acreditado`. La
 * diferencia es comisión (o faltante) y se anota como gasto. Si cayó más de
 * lo esperado, algo está mal anotado: no se acepta.
 */
export function comisionDeAcreditacion(esperado: Centesimos, acreditado: Centesimos): Centesimos {
  if (acreditado > esperado) {
    throw new Error("Cayó más de lo que había para acreditar. Revisá los viajes con tarjeta.");
  }
  return restar(esperado, acreditado);
}

/** Porcentaje real que se llevó Handy, en centésimos de punto (para comparar con el ajuste). */
export function porcentajeReal(esperado: Centesimos, comision: Centesimos): number {
  if (esperado <= 0) return 0;
  return Math.round((comision * 10_000) / esperado);
}

