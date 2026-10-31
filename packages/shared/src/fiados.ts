/**
 * Reglas de fiados y cobros (especificación §4, "Fiados y cobros"), como
 * funciones puras. La API las usa dentro de la transacción y la web para
 * mostrar el resumen antes de guardar: las dos calculan lo mismo.
 */
import { CERO, centesimos, type Centesimos, formatearImporte, type Moneda, restar, sumar } from "./dinero";
import { type Dia, diasEntre } from "./fecha";

export interface DeudaViaje {
  viajeId: number;
  fecha: Dia;
  /** Lo que todavía falta pagar de ese viaje. */
  pendiente: Centesimos;
}

export interface Imputacion {
  viajeId: number;
  importe: Centesimos;
}

/** Orden FIFO: primero el fiado más viejo; a igual fecha, el que se anotó antes. */
function porAntiguedad(a: DeudaViaje, b: DeudaViaje): number {
  return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.viajeId - b.viajeId;
}

/**
 * Regla 4 de CLAUDE.md: el pago se aplica a las deudas más viejas primero.
 * El importe original de cada viaje no cambia; solo se registra cuánto se le aplicó.
 * `sobrante` es lo que pagó de más (queda a favor solo si el dueño lo confirma).
 */
export function imputarFIFO(deudas: DeudaViaje[], pago: Centesimos): { imputaciones: Imputacion[]; sobrante: Centesimos } {
  let resto: Centesimos = pago;
  const imputaciones: Imputacion[] = [];
  for (const deuda of [...deudas].sort(porAntiguedad)) {
    if (resto <= 0) break;
    if (deuda.pendiente <= 0) continue;
    const aplica = centesimos(Math.min(resto, deuda.pendiente));
    imputaciones.push({ viajeId: deuda.viajeId, importe: aplica });
    resto = restar(resto, aplica);
  }
  return { imputaciones, sobrante: resto };
}

export function totalPendiente(deudas: DeudaViaje[]): Centesimos {
  return sumar(CERO, ...deudas.map((d) => (d.pendiente > 0 ? d.pendiente : CERO)));
}

/** Aplica imputaciones y devuelve cómo quedan las deudas (para mostrar el resumen). */
export function aplicarImputaciones(deudas: DeudaViaje[], imputaciones: Imputacion[]): DeudaViaje[] {
  const porViaje = new Map(imputaciones.map((i) => [i.viajeId, i.importe]));
  return deudas.map((d) => ({ ...d, pendiente: restar(d.pendiente, porViaje.get(d.viajeId) ?? CERO) }));
}

/** Antigüedad = días desde el fiado más viejo que todavía tiene saldo. `null` si no debe nada. */
export function antiguedadDias(deudas: DeudaViaje[], hoy: Dia): number | null {
  const pendientes = deudas.filter((d) => d.pendiente > 0).sort(porAntiguedad);
  const masViejo = pendientes[0];
  return masViejo ? Math.max(0, diasEntre(masViejo.fecha, hoy)) : null;
}

export type NivelAlerta = "sin_deuda" | "normal" | "amarilla" | "roja";

/**
 * Colores de la deuda. Por defecto amarillo a los 30 días y rojo a los 60
 * (configurables en Ajustes). Si el cliente tiene un plazo propio, pasa a rojo
 * cuando se vence ese plazo y a amarillo una semana antes.
 */
export function nivelDeAlerta(
  dias: number | null,
  umbrales: { amarilla: number; roja: number },
  plazoCliente?: number | null,
): NivelAlerta {
  if (dias === null) return "sin_deuda";
  if (plazoCliente) {
    if (dias > plazoCliente) return "roja";
    if (dias > plazoCliente - 7) return "amarilla";
    return "normal";
  }
  if (dias >= umbrales.roja) return "roja";
  if (dias >= umbrales.amarilla) return "amarilla";
  return "normal";
}

/** Regla 7 (fiados): avisa antes de anotar un fiado que deja al cliente por encima de su límite. */
export function verificarLimite(
  debeAhora: Centesimos,
  fiadoNuevo: Centesimos,
  limite: Centesimos | null,
): { supera: boolean; disponible: Centesimos | null; quedaria: Centesimos } {
  const quedaria = sumar(debeAhora, fiadoNuevo);
  if (limite === null) return { supera: false, disponible: null, quedaria };
  const disponible = centesimos(Math.max(0, limite - debeAhora));
  return { supera: quedaria > limite, disponible, quedaria };
}

/**
 * Teléfono para wa.me (formato internacional sin "+"). Acepta los formatos de
 * Uruguay: "099 123 456", "99123456", "+598 99 123 456", fijos "4222 1234".
 */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let digitos = telefono.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (digitos.startsWith("598")) digitos = digitos.slice(3);
  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  // Celular: 9 + 7 dígitos. Fijo: 2 (Montevideo) o 4 (interior) + 7 dígitos.
  if (!/^[249]\d{7}$/.test(digitos)) return null;
  return `598${digitos}`;
}

export function mensajeRecordatorio(datos: {
  cliente: string;
  empresa: string;
  debe: Centesimos;
  moneda?: Moneda;
}): string {
  const importe = formatearImporte(datos.debe, { moneda: datos.moneda, sinDecimales: true });
  return (
    `Hola ${datos.cliente}, te escribimos de ${datos.empresa}. ` +
    `Te recordamos que tenés un saldo de ${importe} por viajes. ` +
    "Cuando puedas, pasá por la base o hacé una transferencia. ¡Gracias!"
  );
}

export function enlaceWhatsApp(telefonoInternacional: string, mensaje: string): string {
  return `https://wa.me/${telefonoInternacional}?text=${encodeURIComponent(mensaje)}`;
}

/** Carga inicial: lo que da la hoja de papel = renglones de fiados − pagos anotados. */
export function totalDeLaHoja(renglones: { importe: Centesimos }[], pagos: { importe: Centesimos }[]): Centesimos {
  return restar(sumar(CERO, ...renglones.map((r) => r.importe)), sumar(CERO, ...pagos.map((p) => p.importe)));
}
