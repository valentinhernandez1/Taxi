import { formatearDiaLargo } from "@taxis/shared";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { ElegirDia, hoyUY, leerImporte, MarcoAsistente, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { haceDias, nuevaOpKey, pesos, useCargar } from "../datos";
import type { PersonaConPlata, ResumenPlata } from "../tipos";

function diasDesde(dia: string): number {
  return Math.round((Date.parse(hoyUY()) - Date.parse(dia)) / 86_400_000);
}

function Saldo({ etiqueta, importe }: { etiqueta: string; importe: number }) {
  return (
    <Tarjeta className="flex flex-col gap-1 p-4">
      <span className="text-base font-bold text-suave">{etiqueta}</span>
      <span className="text-[26px] font-bold">{pesos(importe)}</span>
    </Tarjeta>
  );
}

/** Dónde está la plata (flujo 5): todo calculado desde los movimientos. */
export function Plata() {
  const { datos, error } = useCargar<ResumenPlata>("/plata");
  return (
    <Pantalla titulo="Dónde está la plata">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!datos && !error && <p className="text-suave">Cargando…</p>}
      {datos && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Saldo etiqueta="Tu caja (efectivo)" importe={datos.caja} />
            <Saldo etiqueta="Banco" importe={datos.banco} />
            <Saldo etiqueta="Handy, por acreditar" importe={datos.handy} />
            <Saldo etiqueta="Te tienen que entregar" importe={datos.a_entregar} />
          </div>

          <h2 className="m-0 mt-2 text-xl font-bold">Quién tiene plata para entregarte</h2>
          <p className="m-0 -mt-2 text-base text-suave">Se calcula con lo que anotaste: viajes y cobros en efectivo que recibieron.</p>
          {datos.personas.length === 0 ? (
            <Aviso tipo="bien">Nadie tiene plata tuya ahora.</Aviso>
          ) : (
            <Tarjeta>
              {datos.personas.map((p) => (
                <div key={p.persona_id} className="flex items-center gap-3 border-b border-separador px-4 py-3">
                  <div className="flex flex-1 flex-col">
                    <span className="font-bold">
                      {p.nombre}
                      {p.tipo === "telefonista" ? " (telefonista)" : ""}
                    </span>
                    {p.desde && (
                      <span className="text-base text-suave">
                        {diasDesde(p.desde) === 0 ? "Desde hoy" : `Sin entregar ${haceDias(diasDesde(p.desde))}`}
                      </span>
                    )}
                  </div>
                  <span className="text-xl font-bold whitespace-nowrap">{pesos(p.saldo)}</span>
                  <Link
                    to={`/plata/recibir/${p.persona_id}`}
                    className="flex min-h-12 items-center rounded-xl border-2 border-azul px-3 font-bold text-azul"
                  >
                    Recibir
                  </Link>
                </div>
              ))}
            </Tarjeta>
          )}

          <Tarjeta className="flex flex-col gap-3 p-4">
            <span className="text-xl font-bold">Tarjetas (Handy)</span>
            {datos.handy > 0 ? (
              <>
                <span>
                  {datos.handy_viajes === 1 ? "1 viaje" : `${datos.handy_viajes} viajes`} con tarjeta, {pesos(datos.handy)}, esperando que caigan
                  al banco.
                </span>
                <Link to="/plata/handy" className="flex min-h-14 items-center justify-center rounded-xl bg-azul text-xl font-bold text-white">
                  Ya cayó al banco
                </Link>
              </>
            ) : (
              <span className="text-suave">No hay nada con tarjeta esperando.</span>
            )}
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}

/** Flujo 5: una persona te entrega la plata que tenía. */
export function RecibirPlata() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { datos } = useCargar<ResumenPlata>("/plata");
  const persona: PersonaConPlata | undefined = datos?.personas.find((p) => p.persona_id === Number(id));
  const [paso, setPaso] = useState<"cuanto" | "otro" | "nota" | "listo">("cuanto");
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState("");
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { importe } = leerImporte(texto);

  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  if (!persona && paso !== "listo") {
    return (
      <MarcoAsistente titulo="Recibir plata">
        <Aviso tipo="bien">Esta persona no tiene plata para entregarte.</Aviso>
        <Boton onClick={() => navegar("/plata")}>Volver</Boton>
      </MarcoAsistente>
    );
  }
  const esperado = persona?.saldo ?? 0;
  const entregado = paso === "otro" || paso === "nota" ? (texto.trim() === "0" ? 0 : importe) : esperado;
  const diferencia = entregado == null ? null : esperado - entregado;

  async function guardar(cuanto: number, conNota: string | null) {
    setError(null);
    setGuardando(true);
    try {
      await api("/plata/entregas", {
        metodo: "POST",
        cuerpo: { op_key: opKey, persona_id: Number(id), fecha: hoyUY(), entregado: cuanto, nota: conNota },
      });
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo") {
    return (
      <MarcoAsistente titulo="Recibir plata">
        <Pregunta>Listo</Pregunta>
        <Aviso tipo="bien">La plata quedó en tu caja.</Aviso>
        <Boton onClick={() => navegar("/plata")}>Volver a la plata</Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Recibir plata" onAtras={paso === "cuanto" ? () => navegar("/plata") : () => setPaso(paso === "nota" ? "otro" : "cuanto")}>
      {paso === "cuanto" && persona && (
        <>
          <Pregunta ayuda="Contá la plata antes de tocar.">
            {persona.nombre} te tiene que entregar {pesos(esperado)}
          </Pregunta>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando} onClick={() => guardar(esperado, null)}>
            {guardando ? "Guardando…" : `Entregó justo ${pesos(esperado)}`}
          </Boton>
          <Boton variante="secundario" onClick={() => setPaso("otro")}>
            Entregó otra cantidad
          </Boton>
        </>
      )}

      {paso === "otro" && (
        <>
          <Pregunta ayuda={`Tenía que entregar ${pesos(esperado)}.`}>¿Cuánto entregó?</Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} />
          <Boton disabled={entregado == null} onClick={() => (diferencia === 0 ? guardar(entregado!, null) : setPaso("nota"))}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "nota" && entregado != null && diferencia != null && (
        <>
          <Pregunta>
            {diferencia > 0 ? `Faltan ${pesos(diferencia)}` : `Entregó ${pesos(-diferencia)} de más`}. ¿Por qué no coincide?
          </Pregunta>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Por ejemplo: pagó nafta y trae el ticket"
            className="rounded-xl border-2 border-borde p-3 text-xl"
          />
          <p className="m-0 text-suave">La diferencia queda anotada con esta nota y su saldo vuelve a cero.</p>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando || nota.trim().length < 3} onClick={() => guardar(entregado, nota.trim())}>
            {guardando ? "Guardando…" : `Recibí ${pesos(entregado)}`}
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}

/** Flujo 6: lo que había con tarjeta cayó al banco; la diferencia es la comisión de Handy. */
export function AcreditarHandy() {
  const navegar = useNavigate();
  const { datos } = useCargar<ResumenPlata>("/plata");
  const [paso, setPaso] = useState<"dia" | "cuanto" | "resumen" | "listo">("dia");
  const [dia, setDia] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [comision, setComision] = useState<number | null>(null);
  const { importe, error: errorImporte } = leerImporte(texto);

  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  const esperado = datos.handy;
  const paraElBanco = esperado - datos.handy_comision_estimada;
  const pasaDeMas = importe != null && importe > esperado;

  async function guardar() {
    if (!importe || !dia) return;
    setError(null);
    setGuardando(true);
    try {
      const r = await api<{ comision: number }>("/plata/handy", { metodo: "POST", cuerpo: { op_key: opKey, fecha: dia, importe_acreditado: importe } });
      setComision(r.comision);
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo") {
    return (
      <MarcoAsistente titulo="Handy">
        <Pregunta>Listo</Pregunta>
        <Aviso tipo="bien">
          {pesos(importe ?? 0)} pasaron al banco.
          {comision ? ` La comisión de Handy (${pesos(comision)}) quedó anotada como gasto.` : ""}
        </Aviso>
        <Boton onClick={() => navegar("/plata")}>Volver a la plata</Boton>
      </MarcoAsistente>
    );
  }

  if (esperado <= 0) {
    return (
      <MarcoAsistente titulo="Handy">
        <Aviso tipo="bien">No hay nada con tarjeta esperando.</Aviso>
        <Boton onClick={() => navegar("/plata")}>Volver</Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente
      titulo="Handy"
      paso={["dia", "cuanto", "resumen"].indexOf(paso) + 1}
      total={3}
      onAtras={paso === "dia" ? () => navegar("/plata") : () => setPaso(paso === "resumen" ? "cuanto" : "dia")}
    >
      {paso === "dia" && (
        <>
          <Pregunta ayuda="Mirá el movimiento en el banco.">¿Qué día cayó?</Pregunta>
          <ElegirDia elegido={dia} onElegir={(d) => (setDia(d), setPaso("cuanto"))} />
        </>
      )}
      {paso === "cuanto" && (
        <>
          <Pregunta ayuda={`Había ${pesos(esperado)} con tarjeta. Con la comisión de siempre caerían unos ${pesos(paraElBanco)}.`}>
            ¿Cuánto cayó al banco?
          </Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} error={errorImporte ?? (pasaDeMas ? "Es más de lo que había con tarjeta" : null)} />
          <Boton disabled={!importe || pasaDeMas} onClick={() => setPaso("resumen")}>
            Siguiente
          </Boton>
        </>
      )}
      {paso === "resumen" && importe && dia && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4 text-xl">
            <p className="m-0">
              El {formatearDiaLargo(dia).toLowerCase()} cayeron <strong>{pesos(importe)}</strong> al banco.
            </p>
            <p className="m-0">
              Comisión de Handy: <strong>{pesos(esperado - importe)}</strong>
            </p>
            <p className="m-0 text-base text-suave">La comisión se anota sola como gasto.</p>
          </Tarjeta>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}
