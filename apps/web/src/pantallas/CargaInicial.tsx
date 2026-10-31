import { totalDeLaHoja, type Centesimos } from "@taxis/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { hoyUY, leerImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { nuevaOpKey, pesos, useCargar } from "../datos";
import type { FichaCliente, Persona, ResumenCliente } from "../tipos";

interface Renglon {
  fecha: string;
  importe: string;
  chofer: string; // id o "" = chofer anterior
}

/**
 * Carga inicial (flujo 7): pasar la hoja de fiados de papel tal cual, renglón
 * por renglón, con los pagos anotados, y confirmar que el total coincide.
 */
export function CargaInicial() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { datos: ficha } = useCargar<FichaCliente>(`/clientes/${id}`);
  const { datos: personas } = useCargar<{ personas: Persona[] }>("/personas");
  const choferes = personas?.personas.filter((p) => p.tipo === "chofer") ?? [];
  const [renglones, setRenglones] = useState<Renglon[]>([{ fecha: "", importe: "", chofer: "" }]);
  const [pagos, setPagos] = useState<{ fecha: string; importe: string }[]>([]);
  const [totalHoja, setTotalHoja] = useState("");
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyUY();

  const leidos = renglones.map((r) => leerImporte(r.importe));
  const pagosLeidos = pagos.map((p) => leerImporte(p.importe));
  const todoValido =
    renglones.every((r, i) => r.fecha && r.fecha <= hoy && leidos[i]!.importe) &&
    pagos.every((p, i) => p.fecha && p.fecha <= hoy && pagosLeidos[i]!.importe);
  const calculado = todoValido
    ? totalDeLaHoja(
        leidos.map((l) => ({ importe: l.importe! })),
        pagosLeidos.map((l) => ({ importe: l.importe! })),
      )
    : null;
  const total = leerImporte(totalHoja.trim() === "0" ? "" : totalHoja);
  const totalHojaCentesimos = totalHoja.trim() === "0" ? (0 as Centesimos) : total.importe;
  const coincide = calculado !== null && totalHojaCentesimos !== null && calculado === totalHojaCentesimos;

  async function guardar() {
    if (!coincide) return;
    setError(null);
    setGuardando(true);
    try {
      await api<{ cliente: ResumenCliente }>(`/clientes/${id}/carga-inicial`, {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          renglones: renglones.map((r, i) => ({ fecha: r.fecha, importe: leidos[i]!.importe, chofer_id: r.chofer ? Number(r.chofer) : null })),
          pagos: pagos.map((p, i) => ({ fecha: p.fecha, importe: pagosLeidos[i]!.importe })),
          total_hoja: totalHojaCentesimos,
        },
      });
      navegar(`/clientes/${id}`, { replace: true });
    } catch (e) {
      setError(mensajeDeError(e));
      setGuardando(false);
    }
  }

  const campo = "min-h-14 w-full rounded-xl border-2 border-borde bg-white px-3 text-lg";
  const cambiar = (i: number, cambio: Partial<Renglon>) => setRenglones(renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)));

  return (
    <Pantalla titulo="Hoja de papel" volver={`/clientes/${id}`}>
      <p className="m-0 -mt-2 text-suave">
        {ficha ? `${ficha.cliente.nombre}. ` : ""}Pasá cada renglón de la hoja como está. No cuenta para la facturación de este mes.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Viajes fiados</h2>
        {renglones.map((r, i) => (
          <Tarjeta key={i} className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between font-bold">
              Renglón {i + 1}
              {renglones.length > 1 && (
                <button type="button" className="min-h-12 px-2 text-base text-rojo" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              )}
            </div>
            <label className="flex flex-col gap-1">
              Fecha
              <input type="date" max={hoy} className={campo} value={r.fecha} onChange={(e) => cambiar(i, { fecha: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              Chofer
              <select className={campo} value={r.chofer} onChange={(e) => cambiar(i, { chofer: e.target.value })}>
                <option value="">Chofer anterior / no sé</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Importe
              <input inputMode="decimal" className={campo} value={r.importe} onChange={(e) => cambiar(i, { importe: e.target.value })} placeholder="$" />
            </label>
            {leidos[i]!.error && <span className="font-bold text-rojo">{leidos[i]!.error}</span>}
          </Tarjeta>
        ))}
        <Boton variante="secundario" onClick={() => setRenglones([...renglones, { fecha: "", importe: "", chofer: renglones.at(-1)?.chofer ?? "" }])}>
          Agregar otro renglón
        </Boton>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Pagos anotados en la hoja</h2>
        {pagos.length === 0 && <p className="m-0 text-suave">Si en la hoja hay pagos restados, agregalos acá.</p>}
        {pagos.map((p, i) => (
          <Tarjeta key={i} className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between font-bold">
              Pago {i + 1}
              <button type="button" className="min-h-12 px-2 text-base text-rojo" onClick={() => setPagos(pagos.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
            <input type="date" max={hoy} aria-label={`Fecha del pago ${i + 1}`} className={campo} value={p.fecha} onChange={(e) => setPagos(pagos.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))} />
            <input inputMode="decimal" aria-label={`Importe del pago ${i + 1}`} className={campo} placeholder="$" value={p.importe} onChange={(e) => setPagos(pagos.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))} />
            {pagosLeidos[i]!.error && <span className="font-bold text-rojo">{pagosLeidos[i]!.error}</span>}
          </Tarjeta>
        ))}
        <Boton variante="secundario" onClick={() => setPagos([...pagos, { fecha: "", importe: "" }])}>
          Agregar un pago
        </Boton>
      </section>

      <Tarjeta className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-2 font-bold">
          ¿Cuánto dice la hoja que debe?
          <input inputMode="decimal" className={campo} value={totalHoja} onChange={(e) => setTotalHoja(e.target.value)} placeholder="$" />
        </label>
        {calculado !== null && <span>Viajes menos pagos: <strong>{pesos(calculado)}</strong></span>}
        {calculado !== null && totalHojaCentesimos !== null && !coincide && (
          <Aviso tipo="atencion">
            No coincide: hay una diferencia de {pesos(Math.abs(calculado - totalHojaCentesimos))}. Revisá los renglones o el total.
          </Aviso>
        )}
        {coincide && <Aviso tipo="bien">Coincide con la hoja.</Aviso>}
      </Tarjeta>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton onClick={guardar} disabled={!coincide || guardando}>
        {guardando ? "Guardando…" : "Guardar la hoja"}
      </Boton>
    </Pantalla>
  );
}
