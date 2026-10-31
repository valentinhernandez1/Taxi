import { aNumeric, type Centesimos, type DeudaViaje, formatearDiaLargo, imputarFIFO } from "@taxis/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, ErrorApi, mensajeDeError } from "../api";
import { Buscador, ElegirDia, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Tarjeta } from "../componentes";
import { fechaCorta, nuevaOpKey, pesos, useCargar } from "../datos";
import type { FichaCliente, Persona, ResumenCliente } from "../tipos";

type Paso = "cliente" | "importe" | "medio" | "quien" | "dia" | "resumen" | "listo";

interface Resultado {
  cliente: ResumenCliente;
}

export function AnotarCobro() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const clienteInicial = params.get("cliente");
  const [paso, setPaso] = useState<Paso>(clienteInicial ? "importe" : "cliente");
  const [clienteId, setClienteId] = useState<number | null>(clienteInicial ? Number(clienteInicial) : null);
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<"efectivo" | "transferencia" | null>(null);
  const [recibio, setRecibio] = useState<number | "yo" | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [opKey, setOpKey] = useState(nuevaOpKey);
  const [confirmarAFavor, setConfirmarAFavor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { datos: ficha } = useCargar<FichaCliente>(clienteId ? `/clientes/${clienteId}` : null);
  const { datos: personas } = useCargar<{ personas: Persona[] }>("/personas");
  const { importe, error: errorImporte } = leerImporte(texto);
  const debe = ficha?.cliente.debe ?? (0 as Centesimos);
  const pagaDeMas = importe !== null && importe > debe;

  const orden: Paso[] = ["cliente", "importe", "medio", ...(medio === "efectivo" ? (["quien"] as Paso[]) : []), "dia", "resumen"];
  const indice = orden.indexOf(paso);
  const atras = indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined;

  const deudas: DeudaViaje[] = useMemo(
    () =>
      (ficha?.historial ?? [])
        .filter((h) => h.tipo === "fiado" && !h.anulado && (h.pendiente ?? 0) > 0)
        .map((h) => ({ viajeId: h.id, fecha: h.fecha, pendiente: h.pendiente as Centesimos })),
    [ficha],
  );
  const aplica = importe ? imputarFIFO(deudas, importe) : null;
  const nombreRecibio =
    recibio === "yo" || recibio === null ? null : (personas?.personas.find((p) => p.id === recibio)?.nombre ?? null);

  async function guardar() {
    if (!clienteId || !importe || !medio || !dia) return;
    setError(null);
    setGuardando(true);
    try {
      const r = await api<Resultado>("/cobros", {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          cliente_id: clienteId,
          fecha: dia,
          importe,
          medio,
          recibido_por_id: medio === "efectivo" && recibio !== "yo" ? recibio : null,
          confirmar_a_favor: confirmarAFavor || undefined,
        },
      });
      setResultado(r);
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  function otroCobro() {
    setPaso("cliente");
    setClienteId(null);
    setTexto("");
    setMedio(null);
    setRecibio(null);
    setConfirmarAFavor(false);
    setResultado(null);
    setOpKey(nuevaOpKey());
  }

  if (paso === "listo" && resultado) {
    const queda = resultado.cliente.debe;
    return (
      <MarcoAsistente titulo="Anotar cobro">
        <Pregunta>Cobro guardado</Pregunta>
        <Aviso tipo="bien">
          {resultado.cliente.nombre} {queda === 0 ? "ya no debe nada." : `ahora debe ${pesos(queda)}.`}
          {resultado.cliente.a_favor > 0 && ` Tiene ${pesos(resultado.cliente.a_favor)} a favor.`}
        </Aviso>
        <Boton onClick={() => navegar("/")}>Volver al inicio</Boton>
        <Boton variante="secundario" onClick={otroCobro}>
          Anotar otro cobro
        </Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Anotar cobro" paso={indice + 1} total={orden.length} onAtras={atras}>
      {paso === "cliente" && (
        <ElegirCliente
          elegido={clienteId}
          onElegir={(id) => {
            if (id !== clienteId) setTexto("");
            setClienteId(id);
            setPaso("importe");
          }}
        />
      )}

      {paso === "importe" && ficha && (
        <>
          <Pregunta ayuda={`${ficha.cliente.nombre} debe ${pesos(debe)}.`}>¿Cuánto pagó?</Pregunta>
          <TecladoImporte
            texto={texto}
            onCambio={(t) => {
              setTexto(t);
              setConfirmarAFavor(false);
            }}
            error={errorImporte ?? (pagaDeMas && !confirmarAFavor ? `Es más de lo que debe. Debe ${pesos(debe)}. Revisá el importe.` : null)}
          />
          {debe > 0 && (
            <Boton variante="secundario" onClick={() => setTexto(aNumeric(debe).replace(".", ","))}>
              Pagó todo ({pesos(debe)})
            </Boton>
          )}
          {pagaDeMas && !confirmarAFavor && (
            <button type="button" onClick={() => setConfirmarAFavor(true)} className="min-h-12 font-bold text-azul underline">
              Pagó de más a propósito: dejar {pesos(importe - debe)} a su favor
            </button>
          )}
          <Boton disabled={!importe || (pagaDeMas && !confirmarAFavor)} onClick={() => setPaso("medio")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "medio" && (
        <>
          <Pregunta>¿Cómo pagó?</Pregunta>
          <Opcion elegida={medio === "efectivo"} detalle="En mano" onClick={() => (setMedio("efectivo"), setPaso("quien"))}>
            Efectivo
          </Opcion>
          <Opcion
            elegida={medio === "transferencia"}
            detalle="Va directo al banco"
            onClick={() => (setMedio("transferencia"), setRecibio(null), setPaso("dia"))}
          >
            Transferencia
          </Opcion>
        </>
      )}

      {paso === "quien" && (
        <>
          <Pregunta ayuda="Si no fuiste vos, esa persona te la tiene que entregar.">¿Quién recibió la plata?</Pregunta>
          <Opcion elegida={recibio === "yo"} onClick={() => (setRecibio("yo"), setPaso("dia"))}>
            Vos
          </Opcion>
          {personas?.personas
            .filter((p) => p.tipo !== "dueno")
            .map((p) => (
              <Opcion
                key={p.id}
                elegida={recibio === p.id}
                detalle={p.tipo === "telefonista" ? "Telefonista" : p.tipo === "chofer" ? "Chofer" : undefined}
                onClick={() => (setRecibio(p.id), setPaso("dia"))}
              >
                {p.nombre}
              </Opcion>
            ))}
          <Link to="/mas/personas" className="min-h-12 font-bold text-azul">
            ¿Falta alguien? Agregalo en Choferes y personal
          </Link>
        </>
      )}

      {paso === "dia" && (
        <>
          <Pregunta>¿Qué día pagó?</Pregunta>
          <ElegirDia elegido={dia} onElegir={(d) => (setDia(d), setPaso("resumen"))} />
        </>
      )}

      {paso === "resumen" && ficha && importe && dia && aplica && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4">
            <p className="m-0 text-xl">
              {ficha.cliente.nombre} pagó <strong>{pesos(importe)}</strong> el {formatearDiaLargo(dia).toLowerCase()}
              {medio === "transferencia"
                ? " por transferencia."
                : recibio === "yo"
                  ? " en efectivo, lo recibiste vos."
                  : ` en efectivo a ${nombreRecibio}.`}
            </p>
            <p className="m-0 text-xl font-bold">
              {aplica.sobrante > 0
                ? `Queda sin deuda y con ${pesos(aplica.sobrante)} a favor.`
                : `Le queda debiendo ${pesos(debe - importe)}.`}
            </p>
            <p className="m-0 text-suave">
              {medio === "transferencia"
                ? "Se suma al banco."
                : recibio === "yo"
                  ? "Se suma a tu caja."
                  : `${nombreRecibio} te tiene que entregar ${pesos(importe)}.`}
            </p>
          </Tarjeta>
          {aplica.imputaciones.length > 0 && (
            <Tarjeta className="flex flex-col gap-1 p-4">
              <span className="font-bold text-suave">Se descuenta de lo más viejo</span>
              {aplica.imputaciones.map((i) => {
                const deuda = deudas.find((d) => d.viajeId === i.viajeId)!;
                return (
                  <span key={i.viajeId}>
                    Viaje del {fechaCorta(deuda.fecha)}:{" "}
                    {i.importe === deuda.pendiente ? `queda pago (${pesos(i.importe)})` : `${pesos(i.importe)} de ${pesos(deuda.pendiente)}`}
                  </span>
                );
              })}
            </Tarjeta>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar cobro"}
          </Boton>
          <Boton variante="secundario" onClick={() => setPaso("importe")}>
            Corregir algo
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}

/** Buscador de clientes con su saldo al lado. */
export function ElegirCliente({
  elegido,
  onElegir,
  pregunta = "¿Quién pagó?",
  ayuda = "Al lado ves cuánto debe ahora.",
  permitirNuevo = false,
}: {
  elegido: number | null;
  onElegir: (id: number, cliente?: ResumenCliente) => void;
  pregunta?: string;
  ayuda?: string;
  permitirNuevo?: boolean;
}) {
  const [buscar, setBuscar] = useState("");
  const ruta = buscar.trim() ? `/clientes?buscar=${encodeURIComponent(buscar.trim())}` : permitirNuevo ? "/clientes" : "/clientes?deben=1";
  const { datos } = useCargar<{ clientes: ResumenCliente[] }>(ruta);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await api<{ cliente: ResumenCliente }>("/clientes", { metodo: "POST", cuerpo: { nombre: buscar.trim() } });
      onElegir(r.cliente.id, r.cliente);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : mensajeDeError(e));
    } finally {
      setCreando(false);
    }
  }

  const coincideExacto = datos?.clientes.some((c) => c.nombre.toLowerCase() === buscar.trim().toLowerCase());
  return (
    <>
      <Pregunta ayuda={ayuda}>{pregunta}</Pregunta>
      <Buscador valor={buscar} onCambio={setBuscar} etiqueta="Buscar cliente" />
      <div className="flex flex-col gap-2">
        {datos?.clientes.map((c) => (
          <Opcion
            key={c.id}
            elegida={elegido === c.id}
            onClick={() => onElegir(c.id, c)}
            derecha={<span className="font-bold">{c.debe > 0 ? pesos(c.debe) : ""}</span>}
          >
            {c.nombre}
          </Opcion>
        ))}
        {datos?.clientes.length === 0 && !buscar && <p className="m-0 text-suave">Nadie debe nada. Buscá al cliente por el nombre.</p>}
      </div>
      {permitirNuevo && buscar.trim() && !coincideExacto && (
        <Boton variante="secundario" onClick={crear} disabled={creando}>
          Cliente nuevo: “{buscar.trim()}”
        </Boton>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </>
  );
}
