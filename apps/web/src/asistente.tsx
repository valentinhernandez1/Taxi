/** Piezas de los asistentes de una pregunta por pantalla. */
import { diaEnUruguay, formatearDiaLargo, parsearImporte, sumarDias, type Centesimos } from "@taxis/shared";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Icono } from "./componentes";
import { pesos, useCargar } from "./datos";

export function MarcoAsistente({
  titulo,
  paso,
  total,
  onAtras,
  children,
}: {
  titulo: string;
  paso?: number;
  total?: number;
  onAtras?: () => void;
  children: ReactNode;
}) {
  const navegar = useNavigate();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 pt-3 pb-8">
      <div className="flex min-h-12 items-center justify-between">
        {onAtras ? (
          <button type="button" onClick={onAtras} className="flex min-h-12 items-center gap-1 font-bold text-azul">
            <Icono d="M15 6l-6 6 6 6" /> Atrás
          </button>
        ) : (
          <button type="button" onClick={() => navegar(-1)} className="flex min-h-12 items-center font-bold text-azul">
            Cancelar
          </button>
        )}
        {paso && total ? <span className="text-base text-suave">Paso {paso} de {total}</span> : null}
      </div>
      <div className="text-base font-bold text-suave">{titulo}</div>
      {children}
    </main>
  );
}

export function Pregunta({ children, ayuda }: { children: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="m-0 text-[28px] leading-tight font-bold">{children}</h1>
      {ayuda && <p className="m-0 text-suave">{ayuda}</p>}
    </div>
  );
}

/** Opción grande para tocar; marcada si ya estaba elegida. */
export function Opcion({
  onClick,
  elegida,
  children,
  detalle,
  derecha,
}: {
  onClick: () => void;
  elegida?: boolean;
  children: ReactNode;
  detalle?: ReactNode;
  derecha?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 rounded-[14px] border-2 px-4 py-2 text-left ${
        elegida ? "border-azul bg-azul-claro" : "border-borde bg-white"
      }`}
    >
      <span className="flex flex-1 flex-col">
        <span className="text-xl font-bold">{children}</span>
        {detalle && <span className="text-base text-suave">{detalle}</span>}
      </span>
      {derecha}
    </button>
  );
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "Borrar"];

/**
 * Teclado numérico grande. Devuelve el texto tal cual ("1250,5"); quien lo usa
 * lo convierte con parsearImporte, que rechaza más de 2 decimales.
 */
export function TecladoImporte({ texto, onCambio, error }: { texto: string; onCambio: (t: string) => void; error?: string | null }) {
  let mostrar = "$ 0";
  try {
    if (texto) mostrar = texto.endsWith(",") ? `${pesos(parsearImporte(texto.slice(0, -1) || "0"))},` : pesos(parsearImporte(texto));
  } catch {
    mostrar = `$ ${texto}`;
  }
  function tocar(tecla: string) {
    if (tecla === "Borrar") return onCambio(texto.slice(0, -1));
    if (tecla === ",") return onCambio(texto.includes(",") ? texto : `${texto || "0"},`);
    const [, decimales] = texto.split(",");
    if (decimales !== undefined && decimales.length >= 2) return;
    const nuevo = (texto + tecla).replace(/^0+(?=\d)/, "");
    if (nuevo.replace(",", "").length <= 9) onCambio(nuevo);
  }
  return (
    <div className="flex flex-col gap-3">
      <output
        aria-live="polite"
        className={`flex min-h-20 items-center justify-center rounded-[14px] border-2 bg-white text-[40px] font-bold ${
          error ? "border-rojo" : "border-azul"
        }`}
      >
        {mostrar}
      </output>
      {error && (
        <p role="alert" className="m-0 font-bold text-rojo">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {TECLAS.map((tecla) => (
          <button
            key={tecla}
            type="button"
            aria-label={tecla === "Borrar" ? "Borrar último número" : tecla === "," ? "Coma decimal" : tecla}
            onClick={() => tocar(tecla)}
            className={`min-h-16 rounded-[14px] border border-borde bg-white font-bold ${tecla === "Borrar" ? "text-base" : "text-2xl"}`}
          >
            {tecla}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Lee el texto del teclado: null si está vacío o no es válido. */
export function leerImporte(texto: string): { importe: Centesimos | null; error: string | null } {
  if (!texto) return { importe: null, error: null };
  try {
    const importe = parsearImporte(texto);
    if (importe <= 0) return { importe: null, error: "Tiene que ser más que cero" };
    return { importe, error: null };
  } catch (e) {
    return { importe: null, error: e instanceof Error ? e.message : "Importe inválido" };
  }
}

export function hoyUY(): string {
  return diaEnUruguay(new Date());
}

/**
 * Hoy / Ayer / Otro día (con calendario; no deja elegir el futuro). Con
 * `recientes`, además los días de la última semana, marcando los que faltan
 * anotar (flujo 1: "marcando días sin cargar").
 */
export function ElegirDia({ elegido, onElegir, recientes = false }: { elegido: string | null; onElegir: (dia: string) => void; recientes?: boolean }) {
  const hoy = hoyUY();
  const ayer = sumarDias(hoy, -1);
  const [otro, setOtro] = useState(elegido && elegido !== hoy && elegido !== ayer ? elegido : "");
  const { datos: semana } = useCargar<{ diasSinCargar: string[] }>(
    recientes ? `/viajes/dias?desde=${sumarDias(hoy, -7)}&hasta=${hoy}&desde_el_primero=1` : null,
  );
  const falta = new Set(semana?.diasSinCargar ?? []);
  const nota = (d: string) => (falta.has(d) && d !== hoy ? "Falta anotar" : undefined);
  const dias = recientes ? [2, 3, 4, 5, 6, 7].map((k) => sumarDias(hoy, -k)) : [];
  return (
    <div className="flex flex-col gap-3">
      <Opcion onClick={() => onElegir(hoy)} elegida={elegido === hoy} detalle={formatearDiaLargo(hoy)}>
        Hoy
      </Opcion>
      <Opcion onClick={() => onElegir(ayer)} elegida={elegido === ayer} detalle={nota(ayer) ? `${formatearDiaLargo(ayer)} · Falta anotar` : formatearDiaLargo(ayer)}>
        Ayer
      </Opcion>
      {dias.map((d) => (
        <Opcion key={d} onClick={() => onElegir(d)} elegida={elegido === d} detalle={nota(d)}>
          {formatearDiaLargo(d)}
        </Opcion>
      ))}
      <label className="flex flex-col gap-2 rounded-[14px] border-2 border-borde bg-white p-4">
        <span className="text-xl font-bold">Otro día</span>
        <input
          type="date"
          max={hoy}
          value={otro}
          onChange={(e) => setOtro(e.target.value)}
          className="min-h-14 rounded-xl border-2 border-borde px-3 text-xl"
        />
        {otro && otro <= hoy && (
          <button type="button" onClick={() => onElegir(otro)} className="min-h-14 rounded-xl bg-azul text-xl font-bold text-white">
            Elegir {formatearDiaLargo(otro).toLowerCase()}
          </button>
        )}
      </label>
    </div>
  );
}

export function Buscador({ valor, onCambio, etiqueta = "Buscar" }: { valor: string; onCambio: (t: string) => void; etiqueta?: string }) {
  return (
    <input
      type="search"
      aria-label={etiqueta}
      placeholder={etiqueta}
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      className="min-h-14 w-full rounded-xl border-2 border-borde bg-white px-4 text-xl"
    />
  );
}
