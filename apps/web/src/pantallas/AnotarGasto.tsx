import { formatearDiaLargo } from "@taxis/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, mensajeDeError } from "../api";
import { ElegirDia, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Tarjeta } from "../componentes";
import { nuevaOpKey, pesos, useCargar } from "../datos";
import { FotosComprobante } from "../fotos";
import { ElegirPlata } from "../plataPago";
import type { Categoria, Coche, ConQuePlata } from "../tipos";

type Paso = "categoria" | "coche" | "dia" | "importe" | "pagado" | "plata" | "resumen" | "listo";

/** La comisión de Handy se anota sola al acreditar (caso 9): no se elige a mano. */
const AUTOMATICAS = new Set(["Comisión Handy"]);

/** Flujo 3: anotar un gasto, pagado o pendiente. */
export function AnotarGasto() {
  const navegar = useNavigate();
  const [paso, setPaso] = useState<Paso>("categoria");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [coche, setCoche] = useState<number | "ninguno" | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pagado, setPagado] = useState<boolean | null>(null);
  const [plata, setPlata] = useState<ConQuePlata | null>(null);
  const [textoPlata, setTextoPlata] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [gastoId, setGastoId] = useState<number | null>(null);
  const [fotos, setFotos] = useState<{ id: number; miniatura: boolean }[]>([]);

  const { datos: cats } = useCargar<{ categorias: Categoria[] }>("/categorias");
  const { datos: coches } = useCargar<{ coches: Coche[] }>("/coches");
  const categorias = cats?.categorias.filter((c) => c.activa && !AUTOMATICAS.has(c.nombre)) ?? [];
  const hayCoches = (coches?.coches.length ?? 0) > 0;
  const preguntaCoche = !!categoria?.es_de_coche && hayCoches;
  const { importe, error: errorImporte } = leerImporte(texto);

  const orden: Paso[] = [
    "categoria",
    ...(preguntaCoche ? (["coche"] as Paso[]) : []),
    "dia",
    "importe",
    "pagado",
    ...(pagado ? (["plata"] as Paso[]) : []),
    "resumen",
  ];
  const indice = orden.indexOf(paso);
  const atras = indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined;
  const nombreCoche = typeof coche === "number" ? coches?.coches.find((c) => c.id === coche)?.nombre_movil : null;

  async function guardar() {
    if (!categoria || !dia || !importe || pagado === null) return;
    setError(null);
    setGuardando(true);
    try {
      const r = await api<{ gasto_id: number }>("/gastos", {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          fecha: dia,
          importe,
          categoria_id: categoria.id,
          coche_id: typeof coche === "number" ? coche : null,
          descripcion: descripcion.trim() || null,
          pagado_con: pagado ? plata : null,
        },
      });
      setGastoId(r.gasto_id);
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo" && gastoId) {
    return (
      <MarcoAsistente titulo="Anotar gasto">
        <Pregunta>Gasto guardado</Pregunta>
        <Aviso tipo="bien">{pagado ? `Salió ${pesos(importe ?? 0)} de ${textoPlata}.` : "Quedó pendiente de pago. Cuenta para la ganancia del mes."}</Aviso>
        <FotosComprobante
          tabla="gasto"
          registroId={gastoId}
          fotos={fotos}
          textoBoton="Sacale una foto al ticket"
          alCambiar={() =>
            api<{ gastos: { id: number; comprobantes: { id: number; miniatura: boolean }[] }[] }>(`/gastos?mes=${dia!.slice(0, 7)}`).then((r) =>
              setFotos(r.gastos.find((g) => g.id === gastoId)?.comprobantes ?? []),
            )
          }
        />
        <Boton onClick={() => navegar("/gastos")}>Ver los gastos del mes</Boton>
        <Boton variante="secundario" onClick={() => navegar("/")}>
          Volver al inicio
        </Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Anotar gasto" paso={indice + 1} total={orden.length} onAtras={atras}>
      {paso === "categoria" && (
        <>
          <Pregunta>¿Qué gasto?</Pregunta>
          {categorias.map((c) => (
            <Opcion
              key={c.id}
              elegida={categoria?.id === c.id}
              detalle={c.es_cuota_vehiculo ? "Va aparte de los gastos del coche" : undefined}
              onClick={() => {
                setCategoria(c);
                if (!c.es_de_coche) setCoche(null);
                setPaso(c.es_de_coche && hayCoches ? "coche" : "dia");
              }}
            >
              {c.nombre}
            </Opcion>
          ))}
        </>
      )}

      {paso === "coche" && (
        <>
          <Pregunta>¿De qué coche?</Pregunta>
          {coches?.coches.map((c) => (
            <Opcion key={c.id} elegida={coche === c.id} detalle={c.matricula ?? undefined} onClick={() => (setCoche(c.id), setPaso("dia"))}>
              {c.nombre_movil}
            </Opcion>
          ))}
          {!categoria?.es_cuota_vehiculo && (
            <Opcion elegida={coche === "ninguno"} detalle="Es de los dos o no importa" onClick={() => (setCoche("ninguno"), setPaso("dia"))}>
              De ninguno en especial
            </Opcion>
          )}
        </>
      )}

      {paso === "dia" && (
        <>
          <Pregunta ayuda="El día del ticket o de la factura.">¿Qué día fue?</Pregunta>
          <ElegirDia elegido={dia} onElegir={(d) => (setDia(d), setPaso("importe"))} />
        </>
      )}

      {paso === "importe" && (
        <>
          <Pregunta>¿Cuánto?</Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} error={errorImporte} />
          <Boton disabled={!importe} onClick={() => setPaso("pagado")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "pagado" && (
        <>
          <Pregunta>¿Ya está pagado?</Pregunta>
          <Opcion elegida={pagado === true} detalle="Sale plata hoy" onClick={() => (setPagado(true), setPaso("plata"))}>
            Sí, ya lo pagué
          </Opcion>
          <Opcion
            elegida={pagado === false}
            detalle="Cuenta para la ganancia del mes, pero no sale plata hasta que lo pagues"
            onClick={() => (setPagado(false), setPlata(null), setPaso("resumen"))}
          >
            No, queda pendiente
          </Opcion>
        </>
      )}

      {paso === "plata" && (
        <>
          <Pregunta>¿Con qué plata?</Pregunta>
          <ElegirPlata elegida={plata} onElegir={(p, t) => (setPlata(p), setTextoPlata(t), setPaso("resumen"))} />
        </>
      )}

      {paso === "resumen" && categoria && dia && importe && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4 text-xl">
            <p className="m-0">
              <strong>{categoria.nombre}</strong>
              {nombreCoche ? ` del ${nombreCoche}` : ""} por <strong>{pesos(importe)}</strong>, el {formatearDiaLargo(dia).toLowerCase()}.
            </p>
            <p className="m-0 font-bold">
              {pagado ? `Sale de ${textoPlata}.` : "Queda pendiente: tu caja y el banco no cambian hasta que lo pagues."}
            </p>
            {categoria.es_cuota_vehiculo && <p className="m-0 text-base text-suave">Es cuota del coche: se muestra aparte de los gastos de funcionamiento.</p>}
          </Tarjeta>
          <label className="flex flex-col gap-1 font-bold">
            ¿Querés anotar algo más? <span className="font-normal text-suave">Opcional. Por ejemplo: cambio de aceite</span>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={200}
              className="min-h-14 rounded-xl border-2 border-borde px-3 text-lg font-normal"
            />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
          <Boton variante="secundario" onClick={() => setPaso("importe")}>
            Corregir algo
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}
