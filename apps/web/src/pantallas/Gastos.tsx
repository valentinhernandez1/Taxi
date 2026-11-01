import { sumarMeses } from "@taxis/shared";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { AnularConMotivo } from "../anular";
import { hoyUY, leerImporte, MarcoAsistente, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { cuandoVence, fechaCorta, mesLargo, nuevaOpKey, pesos, useCargar } from "../datos";
import { FotosComprobante } from "../fotos";
import { ElegirPlata } from "../plataPago";
import type { ConQuePlata, GastoDelMes, GastosDelMes as Datos, Vencimiento } from "../tipos";

const FLECHA = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-azul bg-white text-2xl font-bold text-azul disabled:opacity-40";

/** Elegir mes: ‹ Octubre 2026 › (no deja pasar del mes actual). */
export function ElegirMes({ mes, onCambio }: { mes: string; onCambio: (m: string) => void }) {
  const actual = hoyUY().slice(0, 7);
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={FLECHA} onClick={() => onCambio(sumarMeses(mes, -1))} aria-label="Mes anterior">
        ‹
      </button>
      <span className="flex-1 text-center text-xl font-bold">{mesLargo(mes)}</span>
      <button type="button" className={FLECHA} disabled={mes >= actual} onClick={() => onCambio(sumarMeses(mes, 1))} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  );
}

/** Aviso de mes incompleto (regla 9): los totales pueden cambiar. */
export function AvisoIncompleto({ faltan }: { faltan: string[] }) {
  if (faltan.length === 0) return null;
  return (
    <Aviso tipo="atencion">
      Este mes está incompleto: {faltan.length === 1 ? "falta 1 día" : `faltan ${faltan.length} días`} por cargar. Los totales pueden cambiar
      cuando anotes todo.
    </Aviso>
  );
}

type Filtro = "todos" | "pagado" | "pendiente";

export function GastosDelMes() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") ?? hoyUY().slice(0, 7);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const { datos, error, recargar } = useCargar<Datos>(`/gastos?mes=${mes}`);
  const visibles = datos?.gastos.filter((g) => filtro === "todos" || (!g.anulado && g.estado === filtro)) ?? [];

  return (
    <Pantalla titulo="Gastos del mes" volver="/mas">
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <>
          <AvisoIncompleto faltan={datos.cobertura.diasSinCargar} />
          <Tarjeta className="flex flex-col gap-1 p-4">
            <span className="font-bold text-suave">Gastos del coche y generales</span>
            <span className="text-[32px] font-bold">{pesos(datos.totales.funcionamiento)}</span>
            <span>
              <span className="font-bold text-verde">Pagado {pesos(datos.totales.pagado)}</span> ·{" "}
              <span className="font-bold text-amarillo-texto">Pendiente {pesos(datos.totales.pendiente)}</span>
            </span>
            {datos.totales.cuotas > 0 && <span className="text-suave">Cuotas de coches, aparte: {pesos(datos.totales.cuotas)}</span>}
          </Tarjeta>

          <Link to="/gasto" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
            Anotar gasto
          </Link>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Mostrar">
            {(["todos", "pagado", "pendiente"] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={`min-h-12 rounded-xl border-2 font-bold ${filtro === f ? "border-azul bg-azul text-white" : "border-borde bg-white text-tinta"}`}
              >
                {f === "todos" ? "Todos" : f === "pagado" ? "Pagados" : "Pendientes"}
              </button>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="m-0 text-suave">No hay gastos anotados{filtro === "todos" ? " este mes" : ""}.</p>
          ) : (
            <Tarjeta>
              {visibles.map((g) => (
                <FilaGasto key={g.id} gasto={g} alCambiar={recargar} />
              ))}
            </Tarjeta>
          )}
        </>
      )}
    </Pantalla>
  );
}

function FilaGasto({ gasto: g, alCambiar }: { gasto: GastoDelMes; alCambiar: () => void }) {
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pagar(plata: ConQuePlata) {
    setError(null);
    try {
      await api(`/gastos/${g.id}/pagar`, { metodo: "POST", cuerpo: { fecha: hoyUY(), pagado_con: plata } });
      setPagando(false);
      alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <div className={`flex flex-col gap-1 border-b border-separador px-4 py-3 ${g.anulado ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`flex-1 font-bold ${g.anulado ? "line-through" : ""}`}>
          {g.categoria}
          {g.coche ? ` · ${g.coche}` : ""}
        </span>
        <span className={`font-bold whitespace-nowrap ${g.anulado ? "line-through" : ""}`}>{pesos(g.importe)}</span>
      </div>
      <span className="text-base text-suave">{[g.descripcion, fechaCorta(g.fecha), g.es_cuota ? "cuota, va aparte" : null].filter(Boolean).join(" · ")}</span>
      {g.anulado ? (
        <span className="text-base font-bold text-rojo">Anulado: {g.motivo_anulacion}</span>
      ) : g.estado === "pagado" ? (
        <span className="text-base font-bold text-verde">
          Pagado{g.fecha_pago && g.fecha_pago !== g.fecha ? ` el ${fechaCorta(g.fecha_pago)}` : ""}
          {g.pagado_desde ? ` · ${g.pagado_desde}` : ""}
        </span>
      ) : (
        <span className="text-base font-bold text-amarillo-texto">Pendiente de pago</span>
      )}
      {!g.anulado && g.estado === "pendiente" && !pagando && (
        <Boton className="min-h-14 text-lg" onClick={() => setPagando(true)}>
          Ya lo pagué
        </Boton>
      )}
      {pagando && (
        <div className="flex flex-col gap-2 pt-1">
          <span className="font-bold">¿Con qué plata lo pagaste hoy?</span>
          <ElegirPlata elegida={null} onElegir={(p) => pagar(p)} />
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton variante="secundario" className="min-h-14 text-lg" onClick={() => setPagando(false)}>
            Cancelar
          </Boton>
        </div>
      )}
      {!g.anulado && <FotosComprobante tabla="gasto" registroId={g.id} fotos={g.comprobantes} alCambiar={alCambiar} />}
      {!g.anulado && !g.automatico && <AnularConMotivo ruta={`/gastos/${g.id}/anular`} alAnular={alCambiar} />}
    </div>
  );
}

/** Flujo 8: lo que vence en 30 días, lo vencido arriba en rojo. */
export function Vencimientos() {
  const { datos, error, recargar } = useCargar<{ vencimientos: Vencimiento[] }>("/vencimientos");
  return (
    <Pantalla titulo="Vencimientos" volver="/mas">
      <p className="m-0 -mt-2 text-suave">Lo que vence en los próximos 30 días. Se cargan solos desde los gastos fijos.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.vencimientos.length === 0 && <Aviso tipo="bien">No vence nada en los próximos 30 días.</Aviso>}
      {datos?.vencimientos.map((v) => (
        <TarjetaVencimiento key={v.id} v={v} alCambiar={recargar} />
      ))}
      <Link to="/mas/gastos-fijos" className="min-h-12 font-bold text-azul">
        Gastos fijos: agregar o cambiar ›
      </Link>
    </Pantalla>
  );
}

function TarjetaVencimiento({ v, alCambiar }: { v: Vencimiento; alCambiar: () => void }) {
  const navegar = useNavigate();
  const [error, setError] = useState<string | null>(null);
  async function manana() {
    try {
      await api(`/vencimientos/${v.id}/manana`, { metodo: "POST", cuerpo: {} });
      alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }
  return (
    <Tarjeta className={`flex flex-col gap-2 p-4 ${v.vencido ? "border-2 border-rojo bg-rojo-fondo" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex flex-1 flex-col">
          <span className="text-xl font-bold">{v.descripcion}</span>
          <span className="text-base text-suave">
            {[v.categoria, v.coche, v.es_cuota ? "cuota" : null].filter(Boolean).join(" · ")} · {fechaCorta(v.fecha_vence)}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xl font-bold">{v.importe_estimado == null ? "—" : pesos(v.importe_estimado)}</span>
          {v.es_estimado && <span className="text-base text-suave">aprox.</span>}
        </span>
      </div>
      <span className={`font-bold ${v.vencido ? "text-rojo" : v.avisar ? "text-amarillo-texto" : "text-suave"}`}>
        {cuandoVence(v.dias)}
        {v.pospuesto ? " · te aviso mañana" : ""}
      </span>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton className="min-h-14 text-lg" onClick={() => navegar(`/vencimientos/${v.id}/pagar`)}>
        Ya lo pagué
      </Boton>
      {!v.pospuesto && (
        <Boton variante="secundario" className="min-h-14 text-lg" onClick={manana}>
          Avisame mañana
        </Boton>
      )}
      <AnularConMotivo
        ruta={`/vencimientos/${v.id}/omitir`}
        alAnular={alCambiar}
        texto="Este mes no corresponde…"
        pregunta="¿Por qué no corresponde?"
        confirmar="Sacarlo"
      />
    </Tarjeta>
  );
}

/** "Ya lo pagué": cuánto fue de verdad y con qué plata. Genera el gasto del período. */
export function PagarVencimiento() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { datos } = useCargar<{ vencimientos: Vencimiento[] }>("/vencimientos");
  const v = datos?.vencimientos.find((x) => x.id === Number(id));
  const [paso, setPaso] = useState<"importe" | "plata" | "listo">("importe");
  const [texto, setTexto] = useState<string | null>(null);
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const textoActual = texto ?? (v?.importe_estimado ? String(v.importe_estimado / 100).replace(".", ",") : "");
  const { importe, error: errorImporte } = leerImporte(textoActual);

  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  if (paso === "listo") {
    return (
      <MarcoAsistente titulo="Vencimiento">
        <Pregunta>Listo</Pregunta>
        <Aviso tipo="bien">Quedó pago y anotado como gasto.</Aviso>
        <Boton onClick={() => navegar("/vencimientos")}>Volver a los vencimientos</Boton>
      </MarcoAsistente>
    );
  }
  if (!v) {
    return (
      <MarcoAsistente titulo="Vencimiento">
        <Aviso tipo="bien">Ese vencimiento ya no está pendiente.</Aviso>
        <Boton onClick={() => navegar("/vencimientos")}>Volver</Boton>
      </MarcoAsistente>
    );
  }

  async function guardar(plata: ConQuePlata) {
    if (!importe) return;
    setError(null);
    setGuardando(true);
    try {
      await api(`/vencimientos/${v!.id}/pagar`, { metodo: "POST", cuerpo: { op_key: opKey, fecha: hoyUY(), importe, pagado_con: plata } });
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <MarcoAsistente titulo={v.descripcion} paso={paso === "importe" ? 1 : 2} total={2} onAtras={paso === "plata" ? () => setPaso("importe") : undefined}>
      {paso === "importe" && (
        <>
          <Pregunta ayuda={v.es_estimado ? "El importe es aproximado: poné lo que pagaste de verdad." : undefined}>¿Cuánto pagaste?</Pregunta>
          <TecladoImporte texto={textoActual} onCambio={setTexto} error={errorImporte} />
          <Boton disabled={!importe} onClick={() => setPaso("plata")}>
            Siguiente
          </Boton>
        </>
      )}
      {paso === "plata" && (
        <>
          <Pregunta ayuda={importe ? pesos(importe) : undefined}>¿Con qué plata?</Pregunta>
          {error && <Aviso tipo="error">{error}</Aviso>}
          {guardando ? <p className="text-suave">Guardando…</p> : <ElegirPlata elegida={null} onElegir={(p) => guardar(p)} />}
        </>
      )}
    </MarcoAsistente>
  );
}
