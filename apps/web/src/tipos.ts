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
  incobrable?: { id: number; importe: Centesimos; motivo: string; fecha: string } | null;
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

export interface Categoria {
  id: number;
  nombre: string;
  es_de_coche: boolean;
  es_cuota_vehiculo: boolean;
  activa: boolean;
}

export interface ConQuePlata {
  desde: "caja" | "banco" | "persona";
  persona_id?: number | null;
}

export interface GastoDelMes {
  id: number;
  fecha: string;
  importe: Centesimos;
  descripcion: string | null;
  estado: "pagado" | "pendiente";
  fecha_pago: string | null;
  anulado: boolean;
  motivo_anulacion: string | null;
  categoria_id: number;
  categoria: string;
  es_cuota: boolean;
  coche: string | null;
  pagado_desde: string | null;
  automatico: boolean;
  comprobantes: { id: number; miniatura: boolean }[];
}

export interface GastosDelMes {
  periodo: string;
  gastos: GastoDelMes[];
  totales: { total: Centesimos; pagado: Centesimos; pendiente: Centesimos; funcionamiento: Centesimos; cuotas: Centesimos };
  por_categoria: { categoria: string; es_cuota: boolean; total: Centesimos }[];
  cobertura: Cobertura;
}

export interface Vencimiento {
  id: number;
  periodo: string;
  fecha_vence: string;
  importe_estimado: Centesimos | null;
  descripcion: string;
  es_estimado: boolean;
  es_cuota: boolean;
  categoria: string;
  coche: string | null;
  dias: number;
  vencido: boolean;
  avisar: boolean;
  pospuesto: boolean;
}

export type Frecuencia = "mensual" | "bimestral" | "anual" | "meses_especificos";

export interface GastoFijo {
  id: number;
  categoria_id: number;
  coche_id: number | null;
  descripcion: string;
  importe: Centesimos | null;
  importe_estimado: boolean;
  frecuencia: Frecuencia;
  meses: number[] | null;
  dia_del_mes: number;
  primer_periodo: string;
  cuotas_total: number | null;
  fecha_fin: string | null;
  es_cuota_vehiculo: boolean;
  activo: boolean;
  categoria: string;
  coche: string | null;
  cuotas_pagadas: number;
}

export type ConceptoPago = "sueldo" | "jornal" | "adelanto" | "aguinaldo" | "salario_vacacional";

export interface ResumenEmpleados {
  periodo: string;
  total_del_mes: Centesimos;
  por_concepto: Record<ConceptoPago, Centesimos>;
  personas: { persona_id: number; nombre: string; tipo: Persona["tipo"]; pagado_en_el_mes: Centesimos; aguinaldo_estimado: Centesimos }[];
  pagos: { id: number; persona_id: number; concepto: ConceptoPago; periodo: string; importe: Centesimos; fecha: string; anulado: boolean; motivo_anulacion: string | null }[];
  aguinaldo: { desde: string; hasta: string; se_paga: "junio" | "diciembre"; total_estimado: Centesimos };
}

export interface FichaCoche {
  coche: Coche;
  periodo: string;
  facturado: Centesimos;
  viajes: number;
  parte_choferes: Centesimos | null;
  funcionamiento: { categoria: string; total: Centesimos }[];
  total_funcionamiento: Centesimos;
  resultado_antes_de_cuota: Centesimos;
  cuotas: Centesimos;
  resultado_despues_de_cuota: Centesimos;
  cuotas_restantes: number | null;
  proximos_vencimientos: Vencimiento[];
  cobertura: Cobertura;
}

export interface Regla {
  id: number;
  chofer_id: number;
  tipo: "porcentaje" | "jornal" | "sueldo" | "mixto";
  porcentaje_puntos: number | null;
  jornal: Centesimos | null;
  modo_entrega: "entrega_todo" | "se_queda_su_parte";
  momento_fiado: "A" | "B";
  incobrable: "empresa" | "chofer";
  confirmada: boolean;
  vigente_desde: string;
}

export interface ChoferResumen {
  id: number;
  nombre: string;
  telefono: string | null;
  regla: Regla | null;
  para_entregar: Centesimos;
  viajes_sin_liquidar: number;
  sin_liquidar_desde: string | null;
  ultimo_turno: string | null;
}

export interface LiquidacionHecha {
  id: number;
  fecha: string;
  facturado: Centesimos;
  parte_chofer: Centesimos;
  adelantos_fiado: Centesimos;
  parte_fiados_cobrados: Centesimos;
  descuentos: Centesimos;
  gastos: Centesimos;
  esperado: Centesimos;
  entregado: Centesimos;
  diferencia: Centesimos;
  nota: string | null;
  estado: "confirmada" | "anulada";
  motivo_anulacion: string | null;
  regla_confirmada: boolean;
}

export interface CuentaDelTurno {
  chofer: { id: number; nombre: string };
  regla: Regla | null;
  viajes: {
    cantidades: { efectivo: number; tarjeta: number; fiado: number };
    totales: { efectivo: Centesimos; tarjeta: Centesimos; fiado: Centesimos };
    desde: string | null;
    hasta: string | null;
  };
  turnos: { id: number; fecha: string; coche: string; turno: string }[];
  fiados_cobrados: number;
  plata_en_mano: Centesimos;
  cuenta: {
    facturado: Centesimos;
    parte_turno: Centesimos;
    adelanto_fiados: Centesimos;
    pendiente_fiados: Centesimos;
    parte_fiados_cobrados: Centesimos;
    descuentos: Centesimos;
    parte_total: Centesimos;
    esperado: Centesimos;
  } | null;
}

export interface Ganancia {
  periodo: string;
  turnos: { usa: boolean; promedio: { plantilla: string; turnos: number; promedio: Centesimos }[]; sin_chofer: number };
  en_curso: boolean;
  completo: boolean;
  dias_sin_cargar: string[];
  viajes_sin_liquidar: number;
  facturado: Centesimos;
  parte_choferes: Centesimos;
  gastos_coches: Centesimos;
  gastos_generales: Centesimos;
  cuotas: Centesimos;
  incobrables: Centesimos;
  dias_del_mes: number;
  ganancia_negocio: Centesimos;
  te_quedo: Centesimos;
  de_cada_100: { choferes: number; coches: number; generales: number; queda: number } | null;
  equilibrio_por_dia: Centesimos | null;
  real_por_dia: Centesimos;
  por_forma: { efectivo: Centesimos; tarjeta: Centesimos; fiado: Centesimos };
  cobrado: { efectivo: Centesimos; tarjeta_acreditada: Centesimos; cobros_de_fiados: Centesimos; total: Centesimos; deuda_crecio: Centesimos };
  flujo: { cobrado: Centesimos; gastos_pagados: Centesimos; pagos_choferes: Centesimos; pagos_empleados: Centesimos; neto: Centesimos };
  por_coche: {
    id: number;
    nombre: string;
    facturado: Centesimos;
    parte_choferes: Centesimos;
    funcionamiento: Centesimos;
    antes_de_cuota: Centesimos;
    cuotas: Centesimos;
    despues_de_cuota: Centesimos;
  }[];
}

export interface Sugerencia {
  clave: string;
  tipo: "gana" | "pierde" | "dato";
  titulo: string;
  monto: string;
  texto: string;
  como: string;
  enlace?: string;
  accion?: string;
  estado: "hecha" | "descartada" | null;
}

export interface Panel {
  hoy: { viajes: number; facturado: Centesimos; cobros: Centesimos };
  mes_anterior: { periodo: string; te_quedo: Centesimos; facturado: Centesimos; completo: boolean };
  idea: Sugerencia | null;
  sin_rendir: { nombre: string; saldo: Centesimos; desde: string }[];
}

export interface HorarioTurno {
  id: number;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  color: string | null;
  activa: boolean;
}

export interface SemanaTurnos {
  lunes: string;
  dias: string[];
  coches: { id: number; nombre_movil: string }[];
  plantillas: HorarioTurno[];
  choferes: { id: number; nombre: string; tipo: Persona["tipo"] }[];
  turnos: {
    id: number;
    fecha: string;
    coche_id: number;
    plantilla_id: number;
    chofer_id: number | null;
    chofer: string | null;
    sustituye_a: string | null;
  }[];
  huecos: number;
  conflictos: { chofer_id: number; chofer: string; fecha: string; motivo: "mismo_dia" | "se_pisan" }[];
}

export interface TurnoDelDia {
  id: number;
  coche_id: number;
  coche: string;
  plantilla: string;
  chofer_id: number | null;
}
