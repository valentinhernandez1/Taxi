import { formatearDiaLargo, sumarDias } from "@taxis/shared";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { hoyUY } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { fechaCorta, useCargar } from "../datos";
import type { HorarioTurno, SemanaTurnos } from "../tipos";

const TINTES = ["#E6EFF9", "#E5F3EA", "#F1E8F8", "#FFF2D6", "#FCE8E6", "#E8F4F6"];
const FLECHA = "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-azul bg-white text-2xl font-bold text-azul";

const horas = (p: HorarioTurno) => `${Number(p.hora_inicio.slice(0, 2))} a ${Number(p.hora_fin.slice(0, 2))}`;

interface Lugar {
  fecha: string;
  coche_id: number;
  plantilla_id: number;
}

/** Grilla semanal: día × coche × turno. Tocar un turno cambia el chofer. */
export function Turnos() {
  const [params, setParams] = useSearchParams();
  const dia = params.get("dia") ?? hoyUY();
  const { datos: s, error, recargar } = useCargar<SemanaTurnos>(`/turnos/semana?dia=${dia}`);
  const [elegido, setElegido] = useState<Lugar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  if (error) {
    return (
      <Pantalla titulo="Turnos" volver="/mas">
        <Aviso tipo="error">{error}</Aviso>
      </Pantalla>
    );
  }
  if (!s) return <p className="p-6 text-suave">Cargando…</p>;

  const tinte = new Map(s.choferes.map((c, i) => [c.id, TINTES[i % TINTES.length]!]));
  const conConflicto = new Set(s.conflictos.map((c) => `${c.chofer_id}|${c.fecha}`));
  const turnoEn = (l: Lugar) => s.turnos.find((t) => t.fecha === l.fecha && t.coche_id === l.coche_id && t.plantilla_id === l.plantilla_id);
  const nombreCoche = (id: number) => s.coches.find((c) => c.id === id)?.nombre_movil ?? "";
  const nombreTurno = (id: number) => s.plantillas.find((p) => p.id === id)?.nombre ?? "";

  async function asignar(chofer_id: number | null) {
    if (!elegido) return;
    setErrorAccion(null);
    try {
      await api("/turnos", { metodo: "PUT", cuerpo: { ...elegido, chofer_id } });
      setElegido(null);
      recargar();
    } catch (e) {
      setErrorAccion(mensajeDeError(e));
    }
  }

  async function repetir() {
    setErrorAccion(null);
    setAviso(null);
    try {
      const r = await api<{ copiados: number; ya_estaban: number }>("/turnos/repetir", { metodo: "POST", cuerpo: { dia: s!.lunes } });
      setAviso(
        r.copiados === 0
          ? "No había nada para copiar: los turnos de esta semana ya estaban decididos."
          : `Se copiaron ${r.copiados} turnos de la semana anterior${r.ya_estaban ? ` (${r.ya_estaban} ya estaban decididos y no se tocaron)` : ""}. Revisá los marcados.`,
      );
      recargar();
    } catch (e) {
      setErrorAccion(mensajeDeError(e));
    }
  }

  const actual = elegido ? turnoEn(elegido) : undefined;

  return (
    <Pantalla titulo="Turnos" volver="/mas">
      <div className="flex items-center gap-2">
        <button type="button" className={FLECHA} onClick={() => setParams({ dia: sumarDias(s.lunes, -7) })} aria-label="Semana anterior">
          ‹
        </button>
        <span className="flex-1 text-center font-bold">
          Semana del {fechaCorta(s.lunes)} al {fechaCorta(s.dias[6]!)}
        </span>
        <button type="button" className={FLECHA} onClick={() => setParams({ dia: sumarDias(s.lunes, 7) })} aria-label="Semana siguiente">
          ›
        </button>
      </div>

      {s.coches.length === 0 || s.plantillas.length === 0 ? (
        <Aviso tipo="atencion">
          Para armar los turnos hacen falta coches y horarios.{" "}
          <Link to={s.coches.length === 0 ? "/mas/coches" : "/mas/turnos/horarios"} className="underline">
            Cargarlos
          </Link>
        </Aviso>
      ) : (
        <>
          {s.huecos > 0 && <Aviso tipo="error">{s.huecos === 1 ? "1 turno sin cubrir" : `${s.huecos} turnos sin cubrir`}</Aviso>}
          {s.conflictos.length > 0 && (
            <Aviso tipo="atencion">
              {s.conflictos
                .map((c) => `${c.chofer} tiene ${c.motivo === "mismo_dia" ? "2 turnos" : "turnos que se pisan"} el ${formatearDiaLargo(c.fecha).split(" ")[0]!.toLowerCase()}`)
                .join(" · ")}
            </Aviso>
          )}
          {s.huecos === 0 && s.conflictos.length === 0 && <Aviso tipo="bien">Todos los turnos están cubiertos.</Aviso>}
          {aviso && <Aviso tipo="bien">{aviso}</Aviso>}
          {errorAccion && !elegido && <Aviso tipo="error">{errorAccion}</Aviso>}
          <p className="m-0 text-base text-suave">
            Tocá un turno para cambiar el chofer. {s.plantillas.map((p) => `${p.nombre}: ${horas(p)}`).join(" · ")}.
          </p>

          {s.dias.map((fecha) => (
            <Tarjeta key={fecha} className={`flex flex-col gap-2 p-3 ${fecha === hoyUY() ? "border-2 border-azul" : ""}`}>
              <span className="font-bold">{formatearDiaLargo(fecha)}</span>
              {s.coches.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-base text-suave">{c.nombre_movil}</span>
                  <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${s.plantillas.length}, minmax(0, 1fr))` }}>
                    {s.plantillas.map((p) => {
                      const lugar = { fecha, coche_id: c.id, plantilla_id: p.id };
                      const t = turnoEn(lugar);
                      const conflicto = t?.chofer_id != null && (conConflicto.has(`${t.chofer_id}|${fecha}`) || conConflicto.has(`${t.chofer_id}|${sumarDias(fecha, -1)}`));
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => (setElegido(lugar), setErrorAccion(null))}
                          aria-label={`${formatearDiaLargo(fecha)}, ${c.nombre_movil}, ${p.nombre}: ${t?.chofer ?? "sin cubrir"}. Cambiar`}
                          className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 text-center leading-tight font-bold ${
                            t?.chofer ? (conflicto ? "border-amarillo-borde" : "border-transparent") : "border-dashed border-rojo bg-white text-rojo"
                          }`}
                          style={t?.chofer_id ? { background: tinte.get(t.chofer_id) } : undefined}
                        >
                          <span className="text-xs font-normal text-suave">{p.nombre}</span>
                          <span>
                            {t?.chofer ?? "Sin cubrir"}
                            {conflicto ? " !" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Tarjeta>
          ))}

          <Boton variante="secundario" onClick={repetir}>
            Repetir la semana anterior
          </Boton>
          <Link to="/mas/turnos/horarios" className="min-h-12 font-bold text-azul">
            Horarios de los turnos ›
          </Link>
        </>
      )}

      {elegido && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="¿Quién maneja?">
          <div className="mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-fondo p-4 pb-8">
            <h2 className="m-0 text-2xl font-bold">¿Quién maneja?</h2>
            <p className="m-0 text-suave">
              {formatearDiaLargo(elegido.fecha)} · {nombreCoche(elegido.coche_id)} · {nombreTurno(elegido.plantilla_id)}
              {actual?.sustituye_a ? ` (reemplaza a ${actual.sustituye_a})` : ""}
            </p>
            {s.choferes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => asignar(c.id)}
                className={`min-h-14 rounded-xl border-2 px-4 text-left text-xl font-bold ${actual?.chofer_id === c.id ? "border-azul bg-azul-claro" : "border-borde bg-white"}`}
              >
                {c.nombre}
              </button>
            ))}
            {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
            <Boton variante="peligro" onClick={() => asignar(null)}>
              Dejar sin chofer
            </Boton>
            <Boton variante="secundario" onClick={() => setElegido(null)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </Pantalla>
  );
}

const campo = "min-h-14 rounded-xl border-2 border-borde bg-white px-3 text-lg font-normal";

export function HorariosTurno() {
  const { datos, error, recargar } = useCargar<{ horarios: HorarioTurno[] }>("/turnos/horarios?todos=1");
  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState("06:00");
  const [fin, setFin] = useState("18:00");
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setErrorAlta(null);
    try {
      await api("/turnos/horarios", { metodo: "POST", cuerpo: { nombre, hora_inicio: inicio, hora_fin: fin } });
      setNombre("");
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  async function cambiar(h: HorarioTurno) {
    try {
      await api(`/turnos/horarios/${h.id}`, { metodo: "PUT", cuerpo: { activa: !h.activa } });
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  return (
    <Pantalla titulo="Horarios de los turnos" volver="/turnos">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <Tarjeta>
          {datos.horarios.map((h) => (
            <div key={h.id} className={`flex min-h-16 items-center gap-3 border-b border-separador px-4 last:border-b-0 ${h.activa ? "" : "opacity-60"}`}>
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{h.nombre}</span>
                <span className="text-base text-suave">
                  De {h.hora_inicio} a {h.hora_fin}
                </span>
              </span>
              <button type="button" onClick={() => cambiar(h)} className={`min-h-12 px-2 text-base font-bold ${h.activa ? "text-rojo" : "text-azul"}`}>
                {h.activa ? "No usar más" : "Volver a usar"}
              </button>
            </div>
          ))}
        </Tarjeta>
      )}
      <form onSubmit={agregar} className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Agregar un turno</h2>
        <label className="flex flex-col gap-2 font-bold">
          Nombre <span className="font-normal text-suave">Por ejemplo: Tarde</span>
          <input className={campo} required maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 font-bold">
            Empieza
            <input className={campo} type="time" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </label>
          <label className="flex flex-col gap-2 font-bold">
            Termina
            <input className={campo} type="time" required value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
        </div>
        {errorAlta && <Aviso tipo="error">{errorAlta}</Aviso>}
        <Boton type="submit">Agregar</Boton>
      </form>
    </Pantalla>
  );
}
