import { aNumeric } from "@taxis/shared";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { leerImporte } from "../asistente";
import { Aviso, Boton, Pantalla } from "../componentes";
import { useCargar } from "../datos";
import type { FichaCliente, ResumenCliente } from "../tipos";

/** Alta y edición de un cliente. Para editar recibe :id. */
export function ClienteForm() {
  const { id } = useParams();
  const { datos } = useCargar<FichaCliente>(id ? `/clientes/${id}` : null);
  if (id && !datos) return <p className="p-6 text-suave">Cargando…</p>;
  return <Formulario key={id ?? "nuevo"} ficha={datos} />;
}

function Formulario({ ficha }: { ficha: FichaCliente | null }) {
  const navegar = useNavigate();
  const c = ficha?.cliente;
  const [nombre, setNombre] = useState(c?.nombre ?? "");
  const [telefono, setTelefono] = useState(c?.telefono ?? "");
  const [observaciones, setObservaciones] = useState(c?.observaciones ?? "");
  const [limite, setLimite] = useState(c?.limite_fiado ? aNumeric(c.limite_fiado).replace(".", ",").replace(/,00$/, "") : "");
  const [plazo, setPlazo] = useState(c?.plazo_dias ? String(c.plazo_dias) : "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    const limiteLeido = leerImporte(limite.trim());
    if (limiteLeido.error) return setError(`Límite de fiado: ${limiteLeido.error}`);
    if (plazo.trim() && !/^\d+$/.test(plazo.trim())) return setError("El plazo son días, sin decimales");
    const cuerpo = {
      nombre,
      telefono,
      observaciones,
      limite_fiado: limiteLeido.importe,
      plazo_dias: plazo.trim() ? Number(plazo.trim()) : null,
      ...(c ? { motivo } : {}),
    };
    setGuardando(true);
    try {
      const r = await api<{ cliente: ResumenCliente }>(c ? `/clientes/${c.id}` : "/clientes", { metodo: c ? "PUT" : "POST", cuerpo });
      navegar(`/clientes/${r.cliente.id}`, { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  }

  async function darDeBaja() {
    if (!c) return;
    setError(null);
    try {
      await api(`/clientes/${c.id}`, { metodo: "PUT", cuerpo: { activo: false, motivo: motivo || "Baja" } });
      navegar("/deben", { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  const campo = "min-h-14 w-full rounded-xl border-2 border-borde bg-white px-4 text-xl font-normal";
  return (
    <Pantalla titulo={c ? "Cambiar datos" : "Cliente nuevo"} volver={c ? `/clientes/${c.id}` : "/deben"}>
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 font-bold">
          Nombre
          <input className={campo} required value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!c} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Teléfono <span className="font-normal text-suave">Para mandarle recordatorios por WhatsApp.</span>
          <input className={campo} type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="099 123 456" />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Notas <span className="font-normal text-suave">Por ejemplo: “paga cuando cobra”.</span>
          <input className={campo} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Límite de fiado <span className="font-normal text-suave">Opcional. Si se pasa, la app avisa antes de anotar.</span>
          <input className={campo} inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sin límite" />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Plazo para pagar (días) <span className="font-normal text-suave">Opcional. Pasado el plazo, la deuda se pone en rojo.</span>
          <input className={campo} inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Sin plazo" />
        </label>
        {c && (
          <label className="flex flex-col gap-2 font-bold">
            ¿Por qué lo cambiás? <span className="font-normal text-suave">Opcional; queda en el historial.</span>
            <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
        {c && c.debe === 0 && (
          <Boton type="button" variante="peligro" onClick={darDeBaja}>
            Dar de baja al cliente
          </Boton>
        )}
      </form>
    </Pantalla>
  );
}
