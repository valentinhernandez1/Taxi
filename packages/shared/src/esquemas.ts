import { z } from "zod";
import { MONEDAS, type Moneda } from "./dinero";

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email("Escribí un email válido").max(200),
  password: z.string().min(1, "Escribí la contraseña").max(200),
});
export type DatosLogin = z.infer<typeof esquemaLogin>;

/** Contraseña nueva del dueño. Larga en vez de compleja: más fácil de recordar. */
export const esquemaPasswordNueva = z
  .string()
  .min(12, "La contraseña tiene que tener al menos 12 caracteres")
  .max(200);

const monedas = Object.keys(MONEDAS) as [Moneda, ...Moneda[]];

const dias = z.number().int().min(1).max(3650);

/**
 * Ajustes básicos de la Etapa 2. Cada clave tiene su esquema y su valor por
 * defecto; los módulos siguientes agregan las suyas acá.
 */
export const AJUSTES = {
  nombre_empresa: {
    etiqueta: "Nombre de la empresa",
    esquema: z.string().trim().min(1, "Escribí un nombre").max(80),
    defecto: "Taxis San Carlos",
  },
  moneda: {
    etiqueta: "Moneda",
    esquema: z.enum(monedas),
    defecto: "UYU" as Moneda,
  },
  alerta_amarilla_dias: {
    etiqueta: "Aviso amarillo de deuda (días)",
    esquema: dias,
    defecto: 30,
  },
  alerta_roja_dias: {
    etiqueta: "Aviso rojo de deuda (días)",
    esquema: dias,
    defecto: 60,
  },
  comision_handy_puntos: {
    etiqueta: "Comisión de Handy (centésimos de %, 300 = 3 %)",
    esquema: z.number().int().min(0).max(10_000),
    defecto: 300,
  },
} as const;

export type ClaveAjuste = keyof typeof AJUSTES;
export type ValoresAjustes = { [K in ClaveAjuste]: z.infer<(typeof AJUSTES)[K]["esquema"]> };

export const CLAVES_AJUSTES = Object.keys(AJUSTES) as ClaveAjuste[];

export function esClaveAjuste(clave: string): clave is ClaveAjuste {
  return Object.hasOwn(AJUSTES, clave);
}

export function ajustesPorDefecto(): ValoresAjustes {
  return Object.fromEntries(CLAVES_AJUSTES.map((c) => [c, AJUSTES[c].defecto])) as ValoresAjustes;
}

export const esquemaCambioAjuste = z.object({
  valor: z.unknown(),
  motivo: z.string().trim().max(300).optional(),
});

/** Valida juntos los ajustes que dependen entre sí. */
export function validarCoherenciaAjustes(valores: ValoresAjustes): string | null {
  if (valores.alerta_roja_dias <= valores.alerta_amarilla_dias) {
    return "El aviso rojo tiene que ser después del amarillo";
  }
  return null;
}
