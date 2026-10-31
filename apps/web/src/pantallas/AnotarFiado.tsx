import { formatearDiaLargo, verificarLimite } from "@taxis/shared";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, ErrorApi, mensajeDeError } from "../api";
import { ElegirDia, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Tarjeta } from "../componentes";
import { nuevaOpKey, pesos, useCargar } from "../datos";
import type { Coche, Persona, ResumenCliente } from "../tipos";
import { ElegirCliente } from "./AnotarCobro";

type Paso = "dia" | "chofer" | "coche" | "importe" | "cliente" | "resumen" | "listo";

export function AnotarFiado() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const clienteFijo = params.get("cliente") ? Number(params.get("cliente")) : null;
  const [paso, setPaso] = useState<Paso>("dia");
  const [dia, setDia] = useState<string | null>(null);
  const [chofer, setChofer] = useState<number | "ninguno" | null>(null);
  const [coche, setCoche] = useState<number | "ninguno" | null>(null);
  const [texto, setTexto] = useState("");
  const [cliente, setCliente] = useState<ResumenCliente | null>(null);
  const [opKey, setOpKey] = useState(nuevaOpKey);
  const [confirmarLimite, setConfirmarLimite] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<ResumenCliente | null>(null);

  const { datos: personas } = useCargar<{ personas: Persona[] }>("/personas");
  const { datos: coches } = useCargar<{ coches: Coche[] }>("/coches");
  const { datos: fijo } = useCargar<{ cliente: ResumenCliente }>(clienteFijo ? `/clientes/${clienteFijo}` : null);
  const clienteElegido = cliente ?? fijo?.cliente ?? null;
  const choferes = personas?.personas.filter((p) => p.tipo === "chofer") ?? [];
  const hayCoches = (coches?.coches.length ?? 0) > 0;
  const { importe, error: errorImporte } = leerImporte(texto);

  const orden: Paso[] = ["dia", "chofer", ...(hayCoches ? (["coche"] as Paso[]) : []), "importe", ...(clienteFijo ? [] : (["cliente"] as Paso[])), "resumen"];
  const indice = orden.indexOf(paso);
  const siguiente = () => setPaso(orden[indice + 1]!);
  const atras = indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined;

  const limite = clienteElegido && importe ? verificarLimite(clienteElegido.debe, importe, clienteElegido.limite_fiado) : null;
  const nombreChofer = typeof chofer === "number" ? choferes.find((c) => c.id === chofer)?.nombre : null;
  const nombreCoche = typeof coche === "number" ? coches?.coches.find((c) => c.id === coche)?.nombre_movil : null;

  async function guardar(yOtro: boolean) {
    if (!clienteElegido || !importe || !dia) return;
    setError(null);
    setGuardando(true);
    try {
      const r = await api<{ cliente: ResumenCliente }>("/fiados", {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          cliente_id: clienteElegido.id,
          fecha: dia,
          importe,
          chofer_id: typeof chofer === "number" ? chofer : null,
          coche_id: typeof coche === "number" ? coche : null,
          confirmar_limite: confirmarLimite || undefined,
        },
      });
      if (yOtro) {
        // Mantiene día, chofer y coche; empieza un viaje nuevo.
        setOpKey(nuevaOpKey());
        setTexto("");
        setCliente(null);
        setConfirmarLimite(false);
        setGuardado(r.cliente);
        setPaso("importe");
      } else {
        setGuardado(r.cliente);
        setPaso("listo");
      }
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) setAviso(e.message);
      else setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo" && guardado) {
    return (
      <MarcoAsistente titulo="Anotar fiado">
        <Pregunta>Fiado guardado</Pregunta>
        <Aviso tipo="bien">
          {guardado.nombre} ahora debe {pesos(guardado.debe)}.
        </Aviso>
        <Boton onClick={() => navegar(`/clientes/${guardado.id}`)}>Ver la ficha de {guardado.nombre}</Boton>
        <Boton variante="secundario" onClick={() => navegar("/")}>
          Volver al inicio
        </Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Anotar fiado" paso={indice + 1} total={orden.length} onAtras={atras}>
      {guardado && paso === "importe" && <Aviso tipo="bien">Guardado. {guardado.nombre} ahora debe {pesos(guardado.debe)}. Anotá el siguiente.</Aviso>}

      {paso === "dia" && (
        <>
          <Pregunta>¿Qué día fue el viaje?</Pregunta>
          <ElegirDia elegido={dia} onElegir={(d) => (setDia(d), siguiente())} />
        </>
      )}

      {paso === "chofer" && (
        <>
          <Pregunta>¿Qué chofer lo hizo?</Pregunta>
          {choferes.map((c) => (
            <Opcion key={c.id} elegida={chofer === c.id} onClick={() => (setChofer(c.id), siguiente())}>
              {c.nombre}
            </Opcion>
          ))}
          <Opcion elegida={chofer === "ninguno"} detalle="No lo sé o no importa" onClick={() => (setChofer("ninguno"), siguiente())}>
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
            <Opcion key={c.id} elegida={coche === c.id} detalle={c.matricula ?? undefined} onClick={() => (setCoche(c.id), siguiente())}>
              {c.nombre_movil}
            </Opcion>
          ))}
          <Opcion elegida={coche === "ninguno"} detalle="No lo sé" onClick={() => (setCoche("ninguno"), siguiente())}>
            Sin coche
          </Opcion>
        </>
      )}

      {paso === "importe" && (
        <>
          <Pregunta>¿Cuánto salió el viaje?</Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} error={errorImporte} />
          <Boton disabled={!importe} onClick={siguiente}>
            Siguiente
          </Boton>
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
            siguiente();
          }}
        />
      )}

      {paso === "resumen" && clienteElegido && importe && dia && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4">
            <p className="m-0 text-xl">
              Viaje del {formatearDiaLargo(dia).toLowerCase()} por <strong>{pesos(importe)}</strong>, fiado a{" "}
              <strong>{clienteElegido.nombre}</strong>
              {nombreChofer ? `. Lo hizo ${nombreChofer}` : ""}
              {nombreCoche ? ` en el ${nombreCoche}` : ""}.
            </p>
            <p className="m-0 font-bold">Va a deber {pesos(clienteElegido.debe + importe - Math.min(clienteElegido.a_favor, importe))}.</p>
            <p className="m-0 text-suave">Un fiado no es plata cobrada: suma a lo que debe, no a la caja.</p>
          </Tarjeta>
          {(limite?.supera || aviso) && !confirmarLimite && (
            <div className="flex flex-col gap-2">
              <Aviso tipo="atencion">
                {aviso ??
                  `Con este viaje quedaría debiendo ${pesos(limite!.quedaria)}, más que su límite de ${pesos(clienteElegido.limite_fiado!)}.`}
              </Aviso>
              <Boton variante="secundario" onClick={() => setConfirmarLimite(true)}>
                Anotarlo igual
              </Boton>
            </div>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton onClick={() => guardar(false)} disabled={guardando || ((limite?.supera || !!aviso) && !confirmarLimite)}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
          {!clienteFijo && (
            <Boton
              variante="secundario"
              onClick={() => guardar(true)}
              disabled={guardando || ((limite?.supera || !!aviso) && !confirmarLimite)}
            >
              Guardar y anotar otro
            </Boton>
          )}
          <Boton variante="secundario" onClick={() => setPaso("importe")}>
            Corregir algo
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}
