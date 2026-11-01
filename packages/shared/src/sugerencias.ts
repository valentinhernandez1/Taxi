/**
 * "Dónde ganar más": reglas que generan sugerencias con su importe estimado y
 * de dónde sale (especificación §4). Son información: el dueño las marca como
 * hechas o las descarta. Funciones puras sobre datos ya sumados.
 */
import { type Centesimos, centesimos, formatearImporte } from "./dinero";

export type TipoSugerencia = "gana" | "pierde" | "dato";

export interface Sugerencia {
  /** Identifica la sugerencia dentro del mes, para recordar si se hizo o se descartó. */
  clave: string;
  tipo: TipoSugerencia;
  titulo: string;
  monto: string;
  texto: string;
  como: string;
  enlace?: string;
  accion?: string;
}

export interface DatosSugerencias {
  /** "octubre". */
  nombre_mes: string;
  deuda: {
    vieja_30: Centesimos;
    clientes_viejos: { nombre: string; debe: Centesimos }[];
    fiados_mes: Centesimos;
    cobros_mes: Centesimos;
  };
  coches: {
    id: number;
    nombre: string;
    facturado: Centesimos;
    /** Taller, repuestos y gomería. */
    mantenimiento: Centesimos;
    combustible: Centesimos;
    /** Meses anteriores, para comparar con él mismo. */
    anteriores: { facturado: Centesimos; mantenimiento: Centesimos }[];
  }[];
  categorias: { id: number; nombre: string; mes: Centesimos; anteriores: Centesimos[] }[];
  vencidos: { descripcion: string; dias: number }[];
  llamadas: { fecha: string; hora: string | null }[];
}

const $ = (c: number) => formatearImporte(centesimos(Math.round(c)), { sinDecimales: true });
const pct = (x: number) => `${Math.round(x * 100)} %`;
const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** Diferencia mínima para que valga la pena avisar. */
const MINIMO = 1_000_00;

function fiados(d: DatosSugerencias["deuda"], mes: string): Sugerencia | null {
  if (d.vieja_30 <= 0) return null;
  const nombres = d.clientes_viejos.slice(0, 2).map((c) => c.nombre);
  const resto = d.clientes_viejos.length - nombres.length;
  const quienes = resto > 0 ? `${nombres.join(", ")} y ${resto} más` : nombres.join(" y ");
  const crecio = d.fiados_mes - d.cobros_mes;
  return {
    clave: "fiados",
    tipo: "gana",
    titulo: "Cobrá los fiados viejos",
    monto: `${$(d.vieja_30)} para cobrar`,
    texto:
      `${quienes} ${d.clientes_viejos.length === 1 ? "debe" : "deben"} ${$(d.vieja_30)} de hace más de 30 días.` +
      (crecio > 0 ? ` En ${mes} se fió ${$(d.fiados_mes)} y se cobró ${$(d.cobros_mes)}: la deuda creció ${$(crecio)}.` : ""),
    como: "Mandales un recordatorio por WhatsApp desde la ficha. Y poné un límite de fiado por cliente: la app avisa antes de fiarle a quien ya debe mucho.",
    enlace: "/deben",
    accion: "Ver quién debe",
  };
}

function coches(lista: DatosSugerencias["coches"]): Sugerencia[] {
  const conViajes = lista.filter((c) => c.facturado > 0);
  const resultado: Sugerencia[] = [];
  for (const c of conViajes) {
    const propio = c.mantenimiento / c.facturado;
    const otros = conViajes.filter((o) => o.id !== c.id).map((o) => o.mantenimiento / o.facturado);
    const historial = c.anteriores.filter((a) => a.facturado > 0).map((a) => a.mantenimiento / a.facturado);
    const comparado: { base: number; contra: string }[] = [];
    if (otros.length) comparado.push({ base: Math.min(...otros), contra: "los otros coches" });
    if (historial.length >= 2) comparado.push({ base: historial.reduce((s, x) => s + x, 0) / historial.length, contra: "sus meses anteriores" });
    // Se compara contra lo más bajo: si gasta de más contra cualquiera de las dos, se avisa.
    const peor = comparado.sort((a, b) => a.base - b.base)[0];
    if (!peor) continue;
    const exceso = (propio - peor.base) * c.facturado;
    if (propio - peor.base < 0.1 || exceso < MINIMO) continue;
    resultado.push({
      clave: `coche:${c.id}`,
      tipo: "pierde",
      titulo: `Revisá el ${c.nombre}`,
      monto: `${$(exceso)} más de taller`,
      texto: `Gastó ${$(c.mantenimiento)} de taller y repuestos: ${pct(propio)} de lo que facturó, contra ${pct(peor.base)} de ${peor.contra}.`,
      como: "Si se repite dos o tres meses, conviene pedir presupuesto de una reparación de fondo y compararlo con cambiar el coche. La ficha del coche muestra la cuenta mes a mes.",
      enlace: `/mas/coches/${c.id}`,
      accion: "Ver el coche",
    });
  }
  return resultado;
}

function gastosQueSuben(categorias: DatosSugerencias["categorias"]): Sugerencia[] {
  const resultado: Sugerencia[] = [];
  for (const c of categorias) {
    const conDatos = c.anteriores.filter((x) => x > 0);
    if (conDatos.length < 2) continue;
    const promedio = c.anteriores.reduce((s, x) => s + x, 0) / c.anteriores.length;
    if (promedio <= 0) continue;
    const suba = (c.mes - promedio) / promedio;
    if (suba < 0.15 || c.mes - promedio < MINIMO / 2) continue;
    resultado.push({
      clave: `categoria:${c.id}`,
      tipo: "pierde",
      titulo: `${c.nombre} subió ${pct(suba)}`,
      monto: `${$(c.mes - promedio)} más`,
      texto: `Este mes fueron ${$(c.mes)}; el promedio de los 3 meses anteriores es ${$(promedio)}.`,
      como: "Fijate en Gastos del mes qué lo hizo subir. Si es combustible, puede ser un coche que consume de más o recorridos más largos.",
      enlace: "/gastos",
      accion: "Ver gastos",
    });
  }
  return resultado;
}

function vencidos(lista: DatosSugerencias["vencidos"]): Sugerencia | null {
  if (lista.length === 0) return null;
  const primero = lista[0]!;
  return {
    clave: "vencimientos",
    tipo: "pierde",
    titulo: "Pagá a tiempo",
    monto: lista.length === 1 ? "1 vencido" : `${lista.length} vencidos`,
    texto:
      lista.length === 1
        ? `${primero.descripcion} venció hace ${-primero.dias} días. Pagar tarde suele traer recargos o cortes.`
        : `${lista.map((v) => v.descripcion).join(", ")} están vencidos. Pagar tarde suele traer recargos o cortes.`,
    como: "La app te avisa 3 días antes y el mismo día de cada vencimiento, en el inicio.",
    enlace: "/vencimientos",
    accion: "Ver vencimientos",
  };
}

/** Noche: de 20 a 6. */
function franja(hora: string | null): "día" | "noche" | null {
  if (!hora) return null;
  const h = Number(hora.slice(0, 2));
  return h >= 20 || h < 6 ? "noche" : "día";
}

function llamadas(lista: DatosSugerencias["llamadas"]): Sugerencia | null {
  if (lista.length === 0) {
    return {
      clave: "llamadas",
      tipo: "dato",
      titulo: "Anotá las llamadas perdidas",
      monto: "Para decidir",
      texto: "Cuando alguien llama y no hay coche libre, ese viaje se pierde y no queda registrado.",
      como: "Si se anota el día y la hora de esas llamadas (Más → Llamadas perdidas), la app te dice en qué horarios falta un coche.",
      enlace: "/mas/llamadas",
      accion: "Anotar llamadas",
    };
  }
  const grupos = new Map<string, number>();
  for (const l of lista) {
    const f = franja(l.hora);
    if (!f) continue;
    const [a, m, d] = l.fecha.split("-").map(Number) as [number, number, number];
    const clave = `${new Date(Date.UTC(a, m - 1, d)).getUTCDay()}-${f}`;
    grupos.set(clave, (grupos.get(clave) ?? 0) + 1);
  }
  const [mejor] = [...grupos.entries()].sort((x, y) => y[1] - x[1]);
  if (!mejor || mejor[1] < 3) return null;
  const [dia, fr] = mejor[0].split("-") as [string, string];
  return {
    clave: `llamadas:${mejor[0]}`,
    tipo: "dato",
    titulo: `Falta un coche los ${DIAS[Number(dia)]} de ${fr}`,
    monto: `${mejor[1]} llamadas perdidas`,
    texto: `En el mes se perdieron ${mejor[1]} llamadas los ${DIAS[Number(dia)]} de ${fr} porque no había coche libre.`,
    como: "Si se repite, conviene sumar un chofer en ese horario o pensar en un tercer coche.",
  };
}

export function generarSugerencias(d: DatosSugerencias): Sugerencia[] {
  const lista: (Sugerencia | null)[] = [
    fiados(d.deuda, d.nombre_mes),
    ...coches(d.coches),
    vencidos(d.vencidos),
    ...gastosQueSuben(d.categorias),
    llamadas(d.llamadas),
  ];
  return lista.filter((s): s is Sugerencia => s !== null);
}
