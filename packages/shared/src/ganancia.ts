/**
 * Ganancia del mes (especificación §4 "Tres números" y "Dónde ganar más").
 * Facturación, cobrado y ganancia son tres números distintos (regla 1).
 */
import { type Centesimos, centesimos } from "./dinero";

export interface DatosGanancia {
  facturado: Centesimos;
  parte_choferes: Centesimos;
  /** Gastos de funcionamiento de los coches (sin cuotas). */
  gastos_coches: Centesimos;
  /** Gastos generales y sueldos que no son de choferes. */
  gastos_generales: Centesimos;
  /** Cuotas de compra de coches: van aparte (regla 11). */
  cuotas: Centesimos;
  /** Fiados que se marcaron como que no se van a cobrar en el mes: plata perdida. */
  incobrables?: Centesimos;
  dias_del_mes: number;
}

export interface CuentaDelMes {
  /** Facturado − choferes − coches − generales. */
  ganancia_negocio: Centesimos;
  /** Ganancia del negocio − cuotas. */
  te_quedo: Centesimos;
  /** De cada $ 100 facturados (enteros que suman 100); nulo si no se facturó nada. */
  de_cada_100: { choferes: number; coches: number; generales: number; queda: number } | null;
  /** Lo que hay que facturar por día para cubrir todo (nulo si los choferes se llevan todo). */
  equilibrio_por_dia: Centesimos | null;
  real_por_dia: Centesimos;
}

export function cuentaDelMes(d: DatosGanancia): CuentaDelMes {
  const ganancia_negocio = centesimos(d.facturado - d.parte_choferes - d.gastos_coches - d.gastos_generales - (d.incobrables ?? 0));
  const parte = (x: number) => Math.round((x * 100) / d.facturado);
  let de_cada_100: CuentaDelMes["de_cada_100"] = null;
  if (d.facturado > 0) {
    const choferes = parte(d.parte_choferes);
    const coches = parte(d.gastos_coches);
    // Los incobrables cuentan con los generales en el reparto de cada $ 100.
    const generales = parte(d.gastos_generales + (d.incobrables ?? 0));
    de_cada_100 = { choferes, coches, generales, queda: 100 - choferes - coches - generales };
  }
  // Los choferes se llevan una proporción de lo facturado; el resto de los gastos es fijo en el mes.
  const proporcion = d.facturado > 0 ? d.parte_choferes / d.facturado : 0;
  const fijos = d.gastos_coches + d.gastos_generales + d.cuotas + (d.incobrables ?? 0);
  const equilibrio_por_dia =
    proporcion >= 1 || d.dias_del_mes <= 0 ? null : centesimos(Math.round(fijos / (1 - proporcion) / d.dias_del_mes));
  return {
    ganancia_negocio,
    te_quedo: centesimos(ganancia_negocio - d.cuotas),
    de_cada_100,
    equilibrio_por_dia,
    real_por_dia: centesimos(d.dias_del_mes > 0 ? Math.round(d.facturado / d.dias_del_mes) : 0),
  };
}
