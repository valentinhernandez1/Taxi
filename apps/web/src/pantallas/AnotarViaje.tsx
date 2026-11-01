import { formatearDiaLargo, verificarLimite } from "@taxis/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, ErrorApi, mensajeDeError } from "../api";
import { ElegirDia, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Tarjeta } from "../componentes";
import { nuevaOpKey, pesos, useCargar } from "../datos";
import type { Coche, Persona, ResumenCliente, TurnoDelDia } from "../tipos";
import { ElegirCliente } from "./AnotarCobro";

type Paso = "dia" | "chofer" | "coche" | "importe" | "pago" | "cliente" | "resumen" | "listo";
type Forma = "efectivo" | "tarjeta" | "fiado";

const FORMAS: { forma: Forma; texto: string; detalle: string }[] = [
  { forma: "efectivo", texto: "Efectivo", detalle: "La plata la tiene el chofer hasta que te la entrega" },
  { forma: "tarjeta", texto: "Tarjeta (Handy)", detalle: "Cae al banco en unos días, menos la comisión" },
  { forma: "fiado", texto: "Fiado", detalle: "Quedó debiendo: no es plata cobrada" },
];

/** Flujo 1: un viaje por vez, como está en el papel. */
export function AnotarViaje() {
  const navegar = useNavigate();
  const [paso, setPaso] = useState<Paso>("dia");
  const [dia, setDia] = useState<string | null>(null);
  const [chofer, setChofer] = useState<number | "ninguno" | null>(null);
  const [coche, setCoche] = useState<number | "ninguno" | null>(null);
  const [texto, setTexto] = useState("");
  const [forma, setForma] = useState<Forma | null>(null);
  const [cliente, setCliente] = useState<ResumenCliente | null>(null);
  const [opKey, setOpKey] = useState(nuevaOpKey);
  const [confirmarLimite, setConfirmarLimite] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [anotados, setAnotados] = useState(0);
  const [ultimo, setUltimo] = useState<string | null>(null);

  const { datos: personas } = useCargar<{ personas: Persona[] }>("/personas");
  const { datos: coches } = useCargar<{ coches: Coche[] }>("/coches");
  // El coche se completa según el turno asignado; si no hay turno, se pregunta.
  const { datos: turnosDelDia } = useCargar<{ turnos: TurnoDelDia[] }>(dia ? `/turnos/dia?fecha=${dia}` : null);
  const turnoDe = (id: number) => {
    const suyos = turnosDelDia?.turnos.filter((t) => t.chofer_id === id) ?? [];
    return suyos.length === 1 ? suyos[0]! : null;
  };
  const turnoElegido = typeof chofer === "number" ? turnoDe(chofer) : null;
  const cocheDelTurno = turnoElegido != null && coche === turnoElegido.coche_id;
  const choferes = personas?.personas.filter((p) => p.tipo === "chofer" || p.tipo === "dueno") ?? [];
  const hayCoches = (coches?.coches.length ?? 0) > 0;
  const { importe, error: errorImporte } = leerImporte(texto);

  const orden: Paso[] = [
    "dia",
    "chofer",
    ...(hayCoches && !cocheDelTurno ? (["coche"] as Paso[]) : []),
    "importe",
    "pago",
    ...(forma === "fiado" ? (["cliente"] as Paso[]) : []),
    "resumen",
  ];
  const indice = orden.indexOf(paso);
  const ir = (p: Paso) => setPaso(p);
  const despuesDelChofer: Paso = hayCoches ? "coche" : "importe";
  const atras = indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined;

  const nombreChofer = typeof chofer === "number" ? choferes.find((c) => c.id === chofer)?.nombre : null;
  const nombreCoche = typeof coche === "number" ? coches?.coches.find((c) => c.id === coche)?.nombre_movil : null;
  const limite = forma === "fiado" && cliente && importe ? verificarLimite(cliente.debe, importe, cliente.limite_fiado) : null;
  const bloqueado = (limite?.supera || !!aviso) && !confirmarLimite;

  function efecto(): string {
    if (!importe) return "";
    if (forma === "efectivo") return nombreChofer ? `${nombreChofer} te tiene que entregar ${pesos(importe)} más.` : `Suma ${pesos(importe)} a tu caja.`;
    if (forma === "tarjeta") return `Queda ${pesos(importe)} esperando que Handy lo pase al banco.`;
    if (cliente) return `${cliente.nombre} va a deber ${pesos(cliente.debe + importe - Math.min(cliente.a_favor, importe))}.`;
    return "";
  }

  async function guardar(yOtro: boolean) {
    if (!importe || !dia || !forma) return;
    setError(null);
    setGuardando(true);
    try {
      await api("/viajes", {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          fecha: dia,
          importe,
          forma_pago: forma,
          chofer_id: typeof chofer === "number" ? chofer : null,
          coche_id: typeof coche === "number" ? coche : null,
          cliente_id: forma === "fiado" ? cliente?.id : null,
          confirmar_limite: confirmarLimite || undefined,
        },
      });
      setAnotados((n) => n + 1);
      setUltimo(`${pesos(importe)} ${forma === "fiado" ? `fiado a ${cliente?.nombre}` : `en ${forma}`}`);
      setOpKey(nuevaOpKey());
      setTexto("");
      setForma(null);
      setCliente(null);
      setConfirmarLimite(false);
      setAviso(null);
      setPaso(yOtro ? "importe" : "listo");
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) setAviso(e.message);
      else setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo") {
    return (
      <MarcoAsistente titulo="Anotar viaje">
        <Pregunta>Listo</Pregunta>
        <Aviso tipo="bien">
          {anotados === 1 ? "Anotaste 1 viaje." : `Anotaste ${anotados} viajes.`} Ya aparecen en el inicio y en la plata de cada uno.
        </Aviso>
        {dia && (
          <Boton variante="secundario" onClick={() => navegar(`/viajes?fecha=${dia}`)}>
            Ver los viajes del {formatearDiaLargo(dia).toLowerCase()}
          </Boton>
        )}
        <Boton
          variante="secundario"
          onClick={() => {
            setAnotados(0);
            setUltimo(null);
            setDia(null);
            setPaso("dia");
          }}
        >
          Anotar viajes de otro día
        </Boton>
        <Boton onClick={() => navegar("/")}>Volver al inicio</Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Anotar viaje" paso={indice + 1} total={orden.length} onAtras={atras}>
      {ultimo && paso === "importe" && <Aviso tipo="bien">Guardado: {ultimo}. Anotá el siguiente.</Aviso>}

      {paso === "dia" && (
        <>
          <Pregunta ayuda="Mirá la fecha en el papel.">¿Qué día fue el viaje?</Pregunta>
          <ElegirDia recientes elegido={dia} onElegir={(d) => (setDia(d), ir(chofer ? (hayCoches && !coche ? "coche" : "importe") : "chofer"))} />
        </>
      )}

      {paso === "chofer" && (
        <>
          <Pregunta ayuda="Se mantiene para los próximos viajes que anotes.">¿Qué chofer lo hizo?</Pregunta>
          {choferes.map((c) => (
            <Opcion
              key={c.id}
              elegida={chofer === c.id}
              detalle={turnoDe(c.id) ? `${turnoDe(c.id)!.coche}, turno ${turnoDe(c.id)!.plantilla.toLowerCase()}` : undefined}
              onClick={() => {
                setChofer(c.id);
                const t = turnoDe(c.id);
                if (t) {
                  setCoche(t.coche_id);
                  ir("importe");
                } else ir(despuesDelChofer);
              }}
            >
              {c.nombre}
            </Opcion>
          ))}
          <Opcion elegida={chofer === "ninguno"} detalle="La plata en efectivo va directo a tu caja" onClick={() => (setChofer("ninguno"), ir(despuesDelChofer))}>
            Sin chofer
          </Opcion>
          <Link to="/mas/personas" className="min-h-12 font-bold text-azul">
            ¿Falta un chofer? Agregalo en Choferes y personal
          </Link>
        </>
      )}

      {paso === "coche" && (
        <>
          <Pregunta>¿En qué coche?</Pregunta>
          {coches?.coches.map((c) => (
            <Opcion key={c.id} elegida={coche === c.id} detalle={c.matricula ?? undefined} onClick={() => (setCoche(c.id), ir("importe"))}>
              {c.nombre_movil}
            </Opcion>
          ))}
          <Opcion elegida={coche === "ninguno"} detalle="No lo sé" onClick={() => (setCoche("ninguno"), ir("importe"))}>
            Sin coche
          </Opcion>
        </>
      )}

      {paso === "importe" && (
        <>
          <Pregunta ayuda="Escribí el importe que dice el papel.">¿Cuánto salió?</Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} error={errorImporte} />
          <Boton disabled={!importe} onClick={() => ir("pago")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "pago" && importe && (
        <>
          <Pregunta ayuda={`${pesos(importe)}${nombreChofer ? ` con ${nombreChofer}` : ""}`}>¿Cómo pagó?</Pregunta>
          {FORMAS.map((f) => (
            <Opcion
              key={f.forma}
              elegida={forma === f.forma}
              detalle={f.detalle}
              onClick={() => {
                setForma(f.forma);
                setAviso(null);
                setConfirmarLimite(false);
                ir(f.forma === "fiado" ? "cliente" : "resumen");
              }}
            >
              {f.texto}
            </Opcion>
          ))}
        </>
      )}

      {paso === "cliente" && (
        <ElegirCliente
          elegido={cliente?.id ?? null}
          pregunta="¿Quién quedó debiendo?"
          ayuda="Buscalo por el nombre. Si es nuevo, escribí el nombre y tocá “Cliente nuevo”."
          permitirNuevo
          onElegir={(_id, c) => {
            if (c) setCliente(c);
            setConfirmarLimite(false);
            setAviso(null);
            ir("resumen");
          }}
        />
      )}

      {paso === "resumen" && importe && dia && forma && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4 text-xl">
            <Fila etiqueta="Día" valor={formatearDiaLargo(dia)} />
            <Fila etiqueta="Chofer" valor={nombreChofer ?? "Sin chofer"} />
            {hayCoches && <Fila etiqueta="Coche" valor={`${nombreCoche ?? "Sin coche"}${cocheDelTurno ? " (según el turno)" : ""}`} />}
            <Fila etiqueta="Importe" valor={pesos(importe)} />
            <Fila etiqueta="Pago" valor={forma === "fiado" ? `Fiado a ${cliente?.nombre ?? "—"}` : FORMAS.find((f) => f.forma === forma)!.texto} />
            <p className="m-0 font-bold">{efecto()}</p>
          </Tarjeta>
          {forma === "fiado" && cliente && (limite?.supera || aviso) && !confirmarLimite && (
            <div className="flex flex-col gap-2">
              <Aviso tipo="atencion">
                {aviso ?? `Con este viaje quedaría debiendo ${pesos(limite!.quedaria)}, más que su límite de ${pesos(cliente.limite_fiado!)}.`}
              </Aviso>
              <Boton variante="secundario" onClick={() => setConfirmarLimite(true)}>
                Anotarlo igual
              </Boton>
            </div>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton onClick={() => guardar(true)} disabled={guardando || bloqueado}>
            {guardando ? "Guardando…" : "Guardar y anotar otro"}
          </Boton>
          <Boton variante="secundario" onClick={() => guardar(false)} disabled={guardando || bloqueado}>
            Guardar y terminar
          </Boton>
          <Boton variante="secundario" onClick={() => ir("importe")}>
            Corregir algo
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-suave">{etiqueta}</span>
      <strong className="text-right">{valor}</strong>
    </div>
  );
}
