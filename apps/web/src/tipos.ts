/** Formas de los datos que devuelve la API (importes en centésimos). */
import type { Centesimos, NivelAlerta } from "@taxis/shared";

export interface ResumenCliente {
  id: number;
  nombre: string;
  telefono: string | null;
  activo: boolean;
  limite_fiado: Centesimos | null;
  plazo_dias: number | null;
  debe: Centesimos;
  a_favor: Centesimos;
  antiguedad_dias: number | null;
  nivel: NivelAlerta;
}

export interface ItemHistorial {
  tipo: "fiado" | "cobro";
  id: number;
  fecha: string;
  importe: Centesimos;
  origen: "normal" | "carga_inicial";
  anulado: boolean;
  motivo_anulacion: string | null;
  chofer?: string | null;
  coche?: string | null;
  nota?: string | null;
  pagado?: Centesimos;
  pendiente?: Centesimos;
  medio?: "efectivo" | "transferencia" | null;
  recibido_por?: string | null;
  aplicado?: { viaje_id: number; fecha: string; importe: Centesimos }[];
  a_favor?: Centesimos;
  comprobantes?: { id: number; miniatura: boolean }[];
}

export interface FichaCliente {
  cliente: ResumenCliente & { observaciones: string | null; ultimo_recordatorio: string | null };
  historial: ItemHistorial[];
}

export interface Persona {
  id: number;
  nombre: string;
  telefono: string | null;
  tipo: "dueno" | "chofer" | "telefonista" | "otro";
  activo: boolean;
}

export interface Coche {
  id: number;
  nombre_movil: string;
  matricula: string | null;
  activo: boolean;
}

export interface ViajeDelDia {
  id: number;
  importe: Centesimos;
  forma_pago: "efectivo" | "tarjeta" | "fiado";
  anulado: boolean;
  motivo_anulacion: string | null;
  chofer: string | null;
  coche: string | null;
  cliente: string | null;
}

export interface DiaDeViajes {
  fecha: string;
  viajes: ViajeDelDia[];
  totales: { efectivo: Centesimos; tarjeta: Centesimos; fiado: Centesimos; total: Centesimos };
  sin_trabajo: boolean;
}

export interface Cobertura {
  completo: boolean;
  diasSinCargar: string[];
}

export interface PersonaConPlata {
  persona_id: number;
  nombre: string;
  tipo: Persona["tipo"];
  saldo: Centesimos;
  desde: string | null;
}

export interface ResumenPlata {
  caja: Centesimos;
  banco: Centesimos;
  handy: Centesimos;
  a_entregar: Centesimos;
  personas: PersonaConPlata[];
  handy_viajes: number;
  handy_comision_estimada: Centesimos;
}
