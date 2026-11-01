import {
  AJUSTES,
  CLAVES_AJUSTES,
  esClaveAjuste,
  formatearPorcentaje,
  MONEDAS,
  parsearImporte,
  type ClaveAjuste,
  type Moneda,
  type ValoresAjustes,
} from "@taxis/shared";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { useAjustes } from "../ajustes";
import { AvisosCelular } from "../avisos";
import { Aviso, Boton, ICONOS, Icono, Pantalla, Tarjeta } from "../componentes";

/** Texto corto y en palabras de todos los días para cada ajuste. */
const PRESENTACION: Record<ClaveAjuste, { titulo: string; pregunta: string; ayuda?: string }> = {
  nombre_empresa: { titulo: "Nombre de la empresa", pregunta: "¿Cómo se llama la empresa?" },
  moneda: { titulo: "Moneda", pregunta: "¿En qué moneda se anotan los importes?" },
  alerta_amarilla_dias: {
    titulo: "Aviso amarillo de deuda",
    pregunta: "¿A los cuántos días una deuda pasa a amarillo?",
    ayuda: "Se cuenta desde el fiado más viejo sin pagar.",
  },
  alerta_roja_dias: {
    titulo: "Aviso rojo de deuda",
    pregunta: "¿A los cuántos días una deuda pasa a rojo?",
    ayuda: "Tiene que ser más que el aviso amarillo.",
  },
  comision_handy_puntos: {
    titulo: "Comisión de Handy",
    pregunta: "¿Qué porcentaje se queda Handy de cada cobro con tarjeta?",
    ayuda: "Por ejemplo 3 o 3,5.",
  },
};

function mostrar(clave: ClaveAjuste, ajustes: ValoresAjustes): string {
  switch (clave) {
    case "alerta_amarilla_dias":
    case "alerta_roja_dias":
      return `${ajustes[clave]} días`;
    case "comision_handy_puntos":
      return `${formatearPorcentaje(ajustes[clave])} %`;
    case "moneda":
      return `${ajustes.moneda} (${MONEDAS[ajustes.moneda].simbolo})`;
    default:
      return String(ajustes[clave]);
  }
}

export function Ajustes() {
  const { ajustes, error } = useAjustes();
  return (
    <Pantalla titulo="Ajustes" volver="/mas">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!ajustes && !error && <p className="m-0 text-suave">Cargando…</p>}
      {ajustes && (
        <Tarjeta>
          {CLAVES_AJUSTES.map((clave) => (
            <Link
              key={clave}
              to={`/mas/ajustes/${clave}`}
              className="flex min-h-16 items-center gap-3 border-b border-separador px-4 py-3 last:border-b-0"
            >
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{PRESENTACION[clave].titulo}</span>
                <span className="text-suave">{mostrar(clave, ajustes)}</span>
              </span>
              <span className="text-suave">
                <Icono d={ICONOS.flecha} />
              </span>
            </Link>
          ))}
        </Tarjeta>
      )}
      <AvisosCelular />
    </Pantalla>
  );
}

/** Una pregunta por pantalla: cambiar un ajuste. */
export function EditarAjuste() {
  const { clave = "" } = useParams();
  const { ajustes, error: errorCarga } = useAjustes();
  if (!esClaveAjuste(clave)) {
    return (
      <Pantalla titulo="Ajustes" volver="/mas/ajustes">
        <Aviso tipo="error">Ese ajuste no existe.</Aviso>
      </Pantalla>
    );
  }
  return (
    <Pantalla titulo={PRESENTACION[clave].titulo} volver="/mas/ajustes">
      {errorCarga && <Aviso tipo="error">{errorCarga}</Aviso>}
      {ajustes && <FormularioAjuste key={clave} clave={clave} ajustes={ajustes} />}
    </Pantalla>
  );
}

function valorInicial(clave: ClaveAjuste, ajustes: ValoresAjustes): string {
  if (clave === "comision_handy_puntos") return formatearPorcentaje(ajustes[clave]);
  return String(ajustes[clave]);
}

function FormularioAjuste({ clave, ajustes }: { clave: ClaveAjuste; ajustes: ValoresAjustes }) {
  const navegar = useNavigate();
  const [texto, setTexto] = useState(valorInicial(clave, ajustes));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { pregunta, ayuda } = PRESENTACION[clave];

  function convertir(entrada: string): unknown {
    if (clave === "alerta_amarilla_dias" || clave === "alerta_roja_dias") {
      if (!/^\d+$/.test(entrada.trim())) throw new Error("Escribí una cantidad de días, sin decimales");
      return Number(entrada.trim());
    }
    if (clave === "comision_handy_puntos") {
      // Mismo formato que un importe: "3,5" → 350 centésimos de punto.
      try {
        return parsearImporte(entrada);
      } catch {
        throw new Error("Escribí el porcentaje con hasta 2 decimales, por ejemplo 3 o 3,5");
      }
    }
    return entrada;
  }

  async function guardar(valor: unknown) {
    setError(null);
    setGuardando(true);
    try {
      const esquema = AJUSTES[clave].esquema.safeParse(valor);
      if (!esquema.success) throw new Error(esquema.error.issues[0]?.message ?? "Valor inválido");
      await api(`/ajustes/${clave}`, { metodo: "PUT", cuerpo: { valor: esquema.data } });
      navegar("/mas/ajustes");
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    try {
      void guardar(convertir(texto));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  if (clave === "moneda") {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xl">{pregunta}</p>
        {(Object.keys(MONEDAS) as Moneda[]).map((moneda) => (
          <Boton
            key={moneda}
            variante={ajustes.moneda === moneda ? "principal" : "secundario"}
            disabled={guardando}
            onClick={() => void guardar(moneda)}
          >
            {moneda === "UYU" ? "Pesos uruguayos ($)" : "Dólares (US$)"}
          </Boton>
        ))}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    );
  }

  const numerico = clave !== "nombre_empresa";
  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-xl">{pregunta}</span>
        {ayuda && <span className="text-suave">{ayuda}</span>}
        <input
          className="min-h-16 w-full rounded-xl border-2 border-borde bg-white px-4 text-2xl font-bold"
          value={texto}
          inputMode={numerico ? "decimal" : "text"}
          autoFocus
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton type="submit" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}
