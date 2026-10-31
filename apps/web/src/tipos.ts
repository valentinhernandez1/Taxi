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
