/**
 * Turnos básicos (especificación §3 flujo 9): grilla día × coche × turno,
 * huecos (turnos sin chofer) y superposiciones (un chofer en dos turnos que se
 * pisan o dos turnos el mismo día). Funciones puras.
 */
import { type Dia, sumarDias } from "./fecha";

/** Lunes de la semana de ese día (la grilla va de lunes a domingo). */
export function lunesDe(dia: Dia): Dia {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((semana + 6) % 7));
}

export function diasDeLaSemana(lunes: Dia): Dia[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

export interface PlantillaTurno {
  id: number;
  nombre: string;
  /** "HH:MM". */
  hora_inicio: string;
  hora_fin: string;
}

export interface TurnoAsignado {
  fecha: Dia;
  coche_id: number;
  plantilla_id: number;
  chofer_id: number | null;
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Intervalo en minutos desde el lunes; si termina "antes" de empezar, cruza la medianoche. */
function intervalo(t: TurnoAsignado, p: PlantillaTurno, lunes: Dia): [number, number] {
  const dias = Math.round((Date.parse(t.fecha) - Date.parse(lunes)) / 86_400_000);
  const inicio = dias * 1440 + minutos(p.hora_inicio);
  let fin = dias * 1440 + minutos(p.hora_fin);
  if (fin <= inicio) fin += 1440;
  return [inicio, fin];
}

export interface Revision {
  huecos: { fecha: Dia; coche_id: number; plantilla_id: number }[];
  conflictos: { chofer_id: number; fecha: Dia; motivo: "mismo_dia" | "se_pisan" }[];
}

/**
 * Revisa una semana: cada día × coche × turno sin chofer es un hueco; un
 * chofer con dos turnos el mismo día, o con turnos que se pisan (por ejemplo,
 * la noche del lunes y un turno de madrugada del martes), es un conflicto.
 */
export function revisarSemana(lunes: Dia, coches: number[], plantillas: PlantillaTurno[], turnos: TurnoAsignado[]): Revision {
  const dias = diasDeLaSemana(lunes);
  const asignado = new Map(turnos.map((t) => [`${t.fecha}|${t.coche_id}|${t.plantilla_id}`, t.chofer_id]));
  const huecos: Revision["huecos"] = [];
  for (const fecha of dias)
    for (const coche_id of coches)
      for (const p of plantillas) if (asignado.get(`${fecha}|${coche_id}|${p.id}`) == null) huecos.push({ fecha, coche_id, plantilla_id: p.id });

  const porId = new Map(plantillas.map((p) => [p.id, p]));
  const conflictos: Revision["conflictos"] = [];
  const vistos = new Set<string>();
  const conChofer = turnos.filter((t) => t.chofer_id != null && porId.has(t.plantilla_id));
  for (let i = 0; i < conChofer.length; i++) {
    for (let j = i + 1; j < conChofer.length; j++) {
      const a = conChofer[i]!;
      const b = conChofer[j]!;
      if (a.chofer_id !== b.chofer_id) continue;
      let motivo: "mismo_dia" | "se_pisan" | null = null;
      const [ai, af] = intervalo(a, porId.get(a.plantilla_id)!, lunes);
      const [bi, bf] = intervalo(b, porId.get(b.plantilla_id)!, lunes);
      if (ai < bf && bi < af) motivo = "se_pisan";
      else if (a.fecha === b.fecha) motivo = "mismo_dia";
      if (!motivo) continue;
      const fecha = a.fecha < b.fecha ? a.fecha : b.fecha;
      const clave = `${a.chofer_id}|${fecha}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      conflictos.push({ chofer_id: a.chofer_id!, fecha, motivo });
    }
  }
  conflictos.sort((x, y) => x.fecha.localeCompare(y.fecha));
  return { huecos, conflictos };
}
