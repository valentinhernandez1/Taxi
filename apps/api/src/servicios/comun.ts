import { type Centesimos, centesimos, type Dia, diaEnUruguay, esDia, MAXIMO_CENTESIMOS } from "@taxis/shared";
import { z } from "zod";
import { ErrorNegocio } from "../errores";

export function hoy(): Dia {
  return diaEnUruguay(new Date());
}

/** Un día de negocio válido que ya llegó (no se anota el futuro). */
export function validarDia(dia: string): Dia {
  if (!esDia(dia)) throw new ErrorNegocio("La fecha no es válida");
  if (dia > hoy()) throw new ErrorNegocio("No se puede anotar un día que todavía no llegó");
  return dia;
}

/**
 * Importes en la API: enteros de centésimos ($ 1.250,50 = 125050). Mayor que
 * cero; un número con decimales se rechaza en vez de redondearse (caso 6).
 */
export const esquemaImporte = z
  .number({ error: "Escribí un importe" })
  .int("El importe no puede tener más de 2 decimales")
  .positive("El importe tiene que ser mayor que cero")
  .max(MAXIMO_CENTESIMOS, "El importe es demasiado grande")
  .transform((n): Centesimos => centesimos(n));

export const esquemaDia = z.string().refine(esDia, "La fecha no es válida");

/** Clave idempotente que genera la pantalla al empezar cada operación (regla 8). */
export const esquemaOpKey = z.string().trim().min(8).max(100);

export const esquemaMotivo = z.string().trim().min(3, "Escribí el motivo").max(300);

export const esquemaId = z.coerce.number().int().positive();

/** Igual que `esquemaImporte` pero admite cero (por ejemplo, alguien que no entregó nada). */
export const esquemaImporteOCero = z
  .number({ error: "Escribí un importe" })
  .int("El importe no puede tener más de 2 decimales")
  .min(0, "El importe no puede ser negativo")
  .max(MAXIMO_CENTESIMOS, "El importe es demasiado grande")
  .transform((n): Centesimos => centesimos(n));
