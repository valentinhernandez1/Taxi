import { useState } from "react";
import { api, mensajeDeError } from "../api";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { useCargar } from "../datos";

interface Cambio {
  id: number;
  fecha: string;
  tabla: string;
  registro_id: string;
  accion: "crear" | "modificar" | "anular" | "login" | "logout" | "cambiar_password";
  motivo: string | null;
  usuario: string | null;
}

const QUE: Record<string, string> = {
  viaje: "un viaje",
  cobro: "un cobro",
  gasto: "un gasto",
  gasto_fijo: "un gasto fijo",
  vencimiento: "un vencimiento",
  liquidacion: "una liquidación",
  regla_liquidacion: "cómo se le paga a un chofer",
  entrega: "una entrega de plata",
  acreditacion_handy: "una acreditación de Handy",
  pago_empleado: "un pago a un empleado",
  fiado_incobrable: "un fiado dado por perdido",
  cliente: "un cliente",
  persona: "una persona",
  coche: "un coche",
  categoria_gasto: "un tipo de gasto",
  turno: "un turno",
  plantilla_turno: "un horario de turno",
  comprobante: "una foto de comprobante",
  ajuste: "un ajuste",
  dia_sin_trabajo: "un día sin trabajo",
};

const ACCION: Record<Cambio["accion"], string> = {
  crear: "Anotó",
  modificar: "Cambió",
  anular: "Anuló",
  login: "Entró a la app",
  logout: "Salió de la app",
  cambiar_password: "Cambió la contraseña",
};

const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Historial de cambios: nada se borra, todo lo corregido queda acá con su motivo (regla 6). */
export function Cambios() {
  const [todo, setTodo] = useState(false);
  const { datos, error } = useCargar<{ cambios: Cambio[] }>(`/panel/cambios${todo ? "?todo=1" : ""}`);
  const [mas, setMas] = useState<Cambio[]>([]);
  const [errorMas, setErrorMas] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const lista = [...(datos?.cambios ?? []), ...mas];
  const ultimaPagina = mas.length ? mas.length % 50 !== 0 : (datos?.cambios.length ?? 0) < 50;

  async function verMas() {
    setCargando(true);
    setErrorMas(null);
    try {
      const r = await api<{ cambios: Cambio[] }>(`/panel/cambios?${todo ? "todo=1&" : ""}antes=${lista.at(-1)!.id}`);
      setMas((m) => [...m, ...r.cambios]);
    } catch (e) {
      setErrorMas(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Pantalla titulo="Historial de cambios" volver="/mas">
      <p className="m-0 -mt-2 text-suave">Nada se borra: lo anulado o corregido queda acá, con quién, cuándo y por qué.</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mostrar">
        {[
          { valor: false, texto: "Anulaciones y cambios" },
          { valor: true, texto: "Todo" },
        ].map((o) => (
          <button
            key={o.texto}
            type="button"
            aria-pressed={todo === o.valor}
            onClick={() => (setTodo(o.valor), setMas([]))}
            className={`min-h-12 rounded-xl border-2 font-bold ${todo === o.valor ? "border-azul bg-azul text-white" : "border-borde bg-white"}`}
          >
            {o.texto}
          </button>
        ))}
      </div>
      {(error || errorMas) && <Aviso tipo="error">{error ?? errorMas}</Aviso>}
      {datos && lista.length === 0 && <Aviso tipo="bien">Todavía no hay nada anulado ni corregido.</Aviso>}
      {lista.length > 0 && (
        <Tarjeta>
          {lista.map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5 border-b border-separador px-4 py-3 last:border-b-0">
              <span className="font-bold">
                {ACCION[c.accion]}
                {["crear", "modificar", "anular"].includes(c.accion) ? ` ${QUE[c.tabla] ?? c.tabla.replace(/_/g, " ")}` : ""}
              </span>
              {c.motivo && <span>“{c.motivo}”</span>}
              <span className="text-base text-suave">{cuando(c.fecha)}</span>
            </div>
          ))}
        </Tarjeta>
      )}
      {datos && !ultimaPagina && (
        <Boton variante="secundario" disabled={cargando} onClick={verMas}>
          Ver más
        </Boton>
      )}
    </Pantalla>
  );
}
