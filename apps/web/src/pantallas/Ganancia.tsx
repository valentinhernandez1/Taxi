import { sumarMeses } from "@taxis/shared";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { hoyUY } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { fechaCorta, mesLargo, pesos, useCargar } from "../datos";
import type { Ganancia as Datos, Sugerencia } from "../tipos";
import { ElegirMes } from "./Gastos";

function Renglon({ texto, importe, signo = "", fuerte, borde = true }: { texto: string; importe: number; signo?: string; fuerte?: boolean; borde?: boolean }) {
  return (
    <div className={`flex min-h-12 items-center justify-between gap-3 px-4 ${borde ? "border-b border-separador" : ""} ${fuerte ? "font-bold" : ""}`}>
      <span>{texto}</span>
      <span className="whitespace-nowrap">
        {signo}
        {pesos(importe)}
      </span>
    </div>
  );
}

const COLORES = { choferes: "bg-azul", coches: "bg-amarillo-borde", generales: "bg-suave", queda: "bg-verde" } as const;

function DeCada100({ d }: { d: NonNullable<Datos["de_cada_100"]> }) {
  const partes = [
    { clave: "choferes", texto: "choferes", valor: d.choferes },
    { clave: "coches", texto: "coches", valor: d.coches },
    { clave: "generales", texto: "generales", valor: d.generales },
    { clave: "queda", texto: d.queda >= 0 ? "te quedan" : "perdiste", valor: d.queda },
  ] as const;
  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <span className="font-bold text-suave">De cada $ 100 que facturaste</span>
      <div className="flex h-5 overflow-hidden rounded-full bg-separador" aria-hidden="true">
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => (
            <div key={p.clave} className={COLORES[p.clave]} style={{ width: `${Math.min(p.valor, 100)}%` }} />
          ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {partes.map((p) => (
          <span key={p.clave} className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-full ${COLORES[p.clave]}`} aria-hidden="true" />
            <strong>$ {Math.abs(p.valor)}</strong> {p.texto}
          </span>
        ))}
      </div>
    </Tarjeta>
  );
}

/** Ganancia del mes: por defecto, el último mes completo. */
export function Ganancia() {
  const [params, setParams] = useSearchParams();
  const actual = hoyUY().slice(0, 7);
  const mes = params.get("mes") ?? sumarMeses(actual, -1);
  const { datos: g, error } = useCargar<Datos>(`/panel/ganancia?mes=${mes}`);
  const nombre = mesLargo(mes).split(" ")[0]!.toLowerCase();

  return (
    <Pantalla titulo="Ganancia">
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!g && !error && <p className="text-suave">Cargando…</p>}
      {g && (
        <>
          {g.en_curso && <Aviso tipo="atencion">{mesLargo(mes)} todavía está en curso: los números van a cambiar.</Aviso>}
          {!g.en_curso && !g.completo && (
            <Aviso tipo="atencion">
              Incompleto:{" "}
              {[
                g.dias_sin_cargar.length ? `${g.dias_sin_cargar.length === 1 ? "falta 1 día" : `faltan ${g.dias_sin_cargar.length} días`} por cargar` : null,
                g.viajes_sin_liquidar ? `${g.viajes_sin_liquidar} viajes sin liquidar (la parte de los choferes puede subir)` : null,
              ]
                .filter(Boolean)
                .join(" y ")}
              .
            </Aviso>
          )}

          <Tarjeta className="flex flex-col gap-1 p-4">
            <span className="font-bold text-suave">Te quedó en {nombre}</span>
            <span className={`text-[36px] font-bold ${g.te_quedo < 0 ? "text-rojo" : ""}`}>{pesos(g.te_quedo)}</span>
            <span className="text-suave">Después de pagar choferes, gastos y cuotas de los coches.</span>
          </Tarjeta>

          {g.de_cada_100 && <DeCada100 d={g.de_cada_100} />}

          <h2 className="m-0 text-xl font-bold">La cuenta del mes</h2>
          <Tarjeta>
            <Renglon texto="Facturado (todos los viajes)" importe={g.facturado} />
            <Renglon texto="Parte de los choferes" importe={g.parte_choferes} signo="− " />
            <Renglon texto="Gastos de los coches" importe={g.gastos_coches} signo="− " />
            <Renglon texto="Gastos generales y sueldos" importe={g.gastos_generales} signo="− " />
            <Renglon texto="Ganancia del negocio" importe={g.ganancia_negocio} fuerte />
            <Renglon texto="Cuotas de los coches" importe={g.cuotas} signo="− " />
            <Renglon texto="Te quedó" importe={g.te_quedo} fuerte borde={false} />
          </Tarjeta>

          {g.equilibrio_por_dia != null && g.facturado > 0 && (
            <Tarjeta className="flex flex-col gap-2 p-4">
              <span className="text-xl font-bold">¿Cuánto hay que facturar para no perder?</span>
              <span>
                <strong>{pesos(g.equilibrio_por_dia)} por día</strong> cubre todos los gastos. En {nombre} facturaste{" "}
                <strong>{pesos(g.real_por_dia)} por día</strong>.
              </span>
              <div className="flex flex-col gap-1">
                {[
                  { texto: "Mínimo", valor: g.equilibrio_por_dia, color: "bg-suave" },
                  { texto: "Real", valor: g.real_por_dia, color: g.real_por_dia >= g.equilibrio_por_dia ? "bg-verde" : "bg-rojo" },
                ].map((b) => (
                  <div key={b.texto} className="flex items-center gap-2">
                    <span className="w-16 text-base">{b.texto}</span>
                    <div className="h-4 flex-1 rounded-full bg-separador">
                      <div
                        className={`h-4 rounded-full ${b.color}`}
                        style={{ width: `${Math.min(100, (b.valor / Math.max(g.equilibrio_por_dia!, g.real_por_dia, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          {g.por_coche.length > 0 && (
            <>
              <h2 className="m-0 text-xl font-bold">Cuánto deja cada coche</h2>
              {g.por_coche.map((c) => (
                <Link key={c.id} to={`/mas/coches/${c.id}?mes=${mes}`}>
                  <Tarjeta className="flex flex-col gap-1 p-4">
                    <span className="flex justify-between font-bold">
                      {c.nombre} <span className="text-azul">›</span>
                    </span>
                    <span className="text-suave">Facturó {pesos(c.facturado)}</span>
                    <span>
                      <strong>{pesos(c.antes_de_cuota)}</strong> después de chofer y gastos
                    </span>
                    {c.cuotas > 0 && (
                      <span>
                        <strong>{pesos(c.despues_de_cuota)}</strong> después de la cuota
                      </span>
                    )}
                  </Tarjeta>
                </Link>
              ))}
            </>
          )}

          <h2 className="m-0 text-xl font-bold">Plata que entró de verdad</h2>
          <Tarjeta>
            <Renglon texto="Viajes en efectivo" importe={g.cobrado.efectivo} />
            <Renglon texto="Tarjetas que cayeron al banco" importe={g.cobrado.tarjeta_acreditada} signo="+ " />
            <Renglon texto="Cobros de fiados" importe={g.cobrado.cobros_de_fiados} signo="+ " />
            <Renglon texto="Cobrado" importe={g.cobrado.total} fuerte />
            <Renglon texto="Gastos pagados" importe={g.flujo.gastos_pagados} signo="− " />
            <Renglon texto="Parte de los choferes" importe={g.flujo.pagos_choferes} signo="− " />
            <Renglon texto="Sueldos" importe={g.flujo.pagos_empleados} signo="− " />
            <Renglon texto="Quedó en la mano" importe={g.flujo.neto} fuerte borde={false} />
          </Tarjeta>
          {g.cobrado.deuda_crecio > 0 && <p className="m-0 text-suave">La deuda de los clientes creció {pesos(g.cobrado.deuda_crecio)} en el mes.</p>}
          {g.cobrado.deuda_crecio < 0 && <p className="m-0 text-suave">La deuda de los clientes bajó {pesos(-g.cobrado.deuda_crecio)} en el mes.</p>}

          <Link to={`/ganancia/ideas?mes=${mes}`} className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
            Ver dónde ganar más
          </Link>
          <Link to={`/mas/exportar?mes=${mes}`} className="min-h-12 font-bold text-azul">
            Bajar los datos del mes para Excel ›
          </Link>
        </>
      )}
    </Pantalla>
  );
}

const CHIPS = {
  gana: "bg-[#E5F3EA] text-verde",
  pierde: "bg-rojo-fondo text-rojo",
  dato: "bg-azul-claro text-azul",
} as const;

export function Ideas() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") ?? sumarMeses(hoyUY().slice(0, 7), -1);
  const { datos, error, recargar } = useCargar<{ periodo: string; completo: boolean; dias_sin_cargar: string[]; sugerencias: Sugerencia[] }>(
    `/panel/sugerencias?mes=${mes}`,
  );
  const [errorMarcar, setErrorMarcar] = useState<string | null>(null);

  async function marcar(s: Sugerencia, estado: Sugerencia["estado"]) {
    setErrorMarcar(null);
    try {
      await api("/panel/sugerencias/estado", { metodo: "POST", cuerpo: { clave: s.clave, periodo: mes, estado } });
      recargar();
    } catch (e) {
      setErrorMarcar(mensajeDeError(e));
    }
  }

  const ordenadas = [...(datos?.sugerencias ?? [])].sort((a, b) => Number(a.estado !== null) - Number(b.estado !== null));
  return (
    <Pantalla titulo="Dónde ganar más" volver={`/ganancia?mes=${mes}`}>
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      <p className="m-0 text-suave">Calculado con los datos de {mesLargo(mes).toLowerCase()}. Son sugerencias: la decisión es tuya.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {errorMarcar && <Aviso tipo="error">{errorMarcar}</Aviso>}
      {datos && !datos.completo && <Aviso tipo="atencion">El mes no está completo: las sugerencias pueden cambiar cuando anotes todo.</Aviso>}
      {datos && datos.sugerencias.length === 0 && <Aviso tipo="bien">No hay nada para marcar este mes.</Aviso>}
      {ordenadas.map((s) => (
        <Tarjeta key={s.clave} className={`flex flex-col gap-2 p-4 ${s.estado ? "opacity-55" : ""}`}>
          <span className="flex items-start justify-between gap-2">
            <span className="text-xl font-bold">{s.titulo}</span>
            <span className={`rounded-lg px-2 py-0.5 text-base font-bold whitespace-nowrap ${CHIPS[s.tipo]}`}>{s.monto}</span>
          </span>
          <span>{s.texto}</span>
          <span className="text-base text-suave">{s.como}</span>
          {s.estado && <span className="font-bold text-suave">{s.estado === "hecha" ? "Ya lo hiciste" : "Descartada"}</span>}
          <div className="flex flex-wrap gap-2">
            {s.enlace && !s.estado && (
              <Link to={s.enlace} className="flex min-h-12 items-center rounded-xl bg-azul px-4 font-bold text-white">
                {s.accion ?? "Ver"}
              </Link>
            )}
            {s.estado ? (
              <button type="button" onClick={() => marcar(s, null)} className="min-h-12 rounded-xl border-2 border-borde bg-white px-4 font-bold">
                Volver a mostrar
              </button>
            ) : (
              <>
                <button type="button" onClick={() => marcar(s, "hecha")} className="min-h-12 rounded-xl border-2 border-borde bg-white px-4 font-bold">
                  Ya lo hice
                </button>
                <button type="button" onClick={() => marcar(s, "descartada")} className="min-h-12 rounded-xl px-2 font-bold text-suave">
                  Descartar
                </button>
              </>
            )}
          </div>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

const campo = "min-h-14 rounded-xl border-2 border-borde bg-white px-3 text-lg font-normal";

/** Llamadas que no se pudieron atender porque no había coche libre. */
export function Llamadas() {
  const { datos, error, recargar } = useCargar<{ llamadas: { id: string; fecha: string; hora: string | null; nota: string | null }[] }>("/panel/llamadas");
  const [fecha, setFecha] = useState(hoyUY());
  const [hora, setHora] = useState("");
  const [nota, setNota] = useState("");
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  async function anotar(e: FormEvent) {
    e.preventDefault();
    setErrorAlta(null);
    setGuardado(false);
    try {
      await api("/panel/llamadas", { metodo: "POST", cuerpo: { fecha, hora: hora || null, nota: nota || null } });
      setHora("");
      setNota("");
      setGuardado(true);
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  return (
    <Pantalla titulo="Llamadas perdidas" volver="/mas">
      <p className="m-0 -mt-2 text-suave">Cuando alguien llama y no hay coche libre. Con el día y la hora, la app te dice en qué horarios falta un coche.</p>
      <form onSubmit={anotar} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 font-bold">
          ¿Qué día?
          <input className={campo} type="date" max={hoyUY()} required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          ¿A qué hora? <span className="font-normal text-suave">Aproximada</span>
          <input className={campo} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Nota <span className="font-normal text-suave">Opcional. Por ejemplo: viaje a Punta del Este</span>
          <input className={campo} maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
        {errorAlta && <Aviso tipo="error">{errorAlta}</Aviso>}
        {guardado && <Aviso tipo="bien">Anotada.</Aviso>}
        <Boton type="submit">Anotar llamada</Boton>
      </form>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.llamadas.length > 0 && (
        <>
          <h2 className="m-0 text-xl font-bold">Últimos 60 días</h2>
          <Tarjeta>
            {datos.llamadas.map((l) => (
              <div key={l.id} className="flex min-h-12 flex-col justify-center border-b border-separador px-4 py-2 last:border-b-0">
                <span className="font-bold">
                  {fechaCorta(l.fecha)}
                  {l.hora ? `, ${l.hora}` : ""}
                </span>
                {l.nota && <span className="text-base text-suave">{l.nota}</span>}
              </div>
            ))}
          </Tarjeta>
        </>
      )}
    </Pantalla>
  );
}

/** Bajar los datos para Excel. */
export function Exportar() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") ?? hoyUY().slice(0, 7);
  const desde = `${mes}-01`;
  const fin = sumarMeses(mes, 1);
  const ultimo = new Date(Date.UTC(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const hasta = ultimo < hoyUY() ? ultimo : hoyUY();
  const archivos = [
    { que: "viajes", texto: "Viajes" },
    { que: "cobros", texto: "Cobros de fiados" },
    { que: "gastos", texto: "Gastos" },
    { que: "movimientos", texto: "Movimientos de plata" },
  ];
  return (
    <Pantalla titulo="Exportar a Excel" volver="/mas">
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      <p className="m-0 text-suave">Se bajan como archivos que abre Excel. Del {fechaCorta(desde)} al {fechaCorta(hasta)}.</p>
      {archivos.map((a) => (
        <a
          key={a.que}
          href={`/api/panel/exportar/${a.que}.csv?desde=${desde}&hasta=${hasta}`}
          download
          className="flex min-h-16 items-center justify-center rounded-[14px] border-2 border-azul bg-white text-xl font-bold text-azul"
        >
          Bajar {a.texto.toLowerCase()}
        </a>
      ))}
    </Pantalla>
  );
}
