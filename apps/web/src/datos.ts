import { formatearImporte, type Centesimos } from "@taxis/shared";
import { useCallback, useEffect, useState } from "react";
import { api, mensajeDeError } from "./api";

/** Carga algo de la API; `recargar` vuelve a pedirlo. */
export function useCargar<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ruta) return;
    let vigente = true;
    api<T>(ruta)
      .then((r) => {
        if (vigente) {
          setDatos(r);
          setError(null);
        }
      })
      .catch((e: unknown) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, [ruta, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, recargar };
}

/** "$ 1.300" sin centavos cuando son cero, como en el prototipo. */
export function pesos(importe: Centesimos | number): string {
  // Espacio que no se parte: "$ 400" nunca queda cortado en dos renglones.
  return formatearImporte(importe as Centesimos, { sinDecimales: true }).replace(" ", "\u00a0");
}

/** Clave única de una operación: se genera al empezar y se reusa si hay que reintentar (regla 8). */
export function nuevaOpKey(): string {
  return crypto.randomUUID();
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10-03" → "3 de octubre". */
export function fechaCorta(dia: string): string {
  const [, m, d] = dia.split("-").map(Number);
  return `${d} de ${MESES[(m ?? 1) - 1]}`;
}

export function haceDias(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

const MESES_TITULO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];

/** "2026-10" → "Octubre 2026". */
export function mesLargo(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return `${MESES_TITULO[(m ?? 1) - 1]} ${a}`;
}

/** "En 3 días", "Hoy", "Venció hace 2 días". */
export function cuandoVence(dias: number): string {
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias > 1) return `En ${dias} días`;
  return dias === -1 ? "Venció ayer" : `Venció hace ${-dias} días`;
}
