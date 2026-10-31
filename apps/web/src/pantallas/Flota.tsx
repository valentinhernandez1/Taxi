/** Choferes y personal; coches. Listas simples para elegir en los asistentes. */
import { useState, type FormEvent } from "react";
import { api, mensajeDeError } from "../api";
import { Opcion } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { useCargar } from "../datos";
import type { Coche, Persona } from "../tipos";

const TIPOS = { chofer: "Chofer", telefonista: "Telefonista", otro: "Otro" } as const;
const campo = "min-h-14 w-full rounded-xl border-2 border-borde bg-white px-4 text-xl font-normal";

export function Personas() {
  const { datos, error, recargar } = useCargar<{ personas: Persona[] }>("/personas");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<keyof typeof TIPOS>("chofer");
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setErrorAlta(null);
    try {
      await api("/personas", { metodo: "POST", cuerpo: { nombre, tipo } });
      setNombre("");
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  async function baja(p: Persona) {
    try {
      await api(`/personas/${p.id}`, { metodo: "PUT", cuerpo: { activo: false } });
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  return (
    <Pantalla titulo="Choferes y personal" volver="/mas">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.personas.filter((p) => p.tipo !== "dueno").length === 0 && <p className="m-0 text-suave">Todavía no hay nadie anotado.</p>}
      {datos && (
        <Tarjeta>
          {datos.personas
            .filter((p) => p.tipo !== "dueno")
            .map((p) => (
              <div key={p.id} className="flex min-h-16 items-center gap-3 border-b border-separador px-4 last:border-b-0">
                <span className="flex flex-1 flex-col">
                  <span className="font-bold">{p.nombre}</span>
                  <span className="text-base text-suave">{TIPOS[p.tipo as keyof typeof TIPOS] ?? p.tipo}</span>
                </span>
                <button type="button" onClick={() => baja(p)} className="min-h-12 px-2 text-base font-bold text-rojo">
                  Dar de baja
                </button>
              </div>
            ))}
        </Tarjeta>
      )}
      <form onSubmit={agregar} className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Agregar</h2>
        <label className="flex flex-col gap-2 font-bold">
          Nombre
          <input className={campo} required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div className="flex flex-col gap-2">
          {(Object.keys(TIPOS) as (keyof typeof TIPOS)[]).map((t) => (
            <Opcion key={t} elegida={tipo === t} onClick={() => setTipo(t)}>
              {TIPOS[t]}
            </Opcion>
          ))}
        </div>
        {errorAlta && <Aviso tipo="error">{errorAlta}</Aviso>}
        <Boton type="submit">Agregar</Boton>
      </form>
    </Pantalla>
  );
}

export function Coches() {
  const { datos, error, recargar } = useCargar<{ coches: Coche[] }>("/coches");
  const [nombre, setNombre] = useState("");
  const [matricula, setMatricula] = useState("");
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setErrorAlta(null);
    try {
      await api("/coches", { metodo: "POST", cuerpo: { nombre_movil: nombre, matricula } });
      setNombre("");
      setMatricula("");
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  async function baja(c: Coche) {
    try {
      await api(`/coches/${c.id}`, { metodo: "PUT", cuerpo: { activo: false } });
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  return (
    <Pantalla titulo="Coches" volver="/mas">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.coches.length === 0 && <p className="m-0 text-suave">Todavía no hay coches anotados.</p>}
      {datos && datos.coches.length > 0 && (
        <Tarjeta>
          {datos.coches.map((c) => (
            <div key={c.id} className="flex min-h-16 items-center gap-3 border-b border-separador px-4 last:border-b-0">
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{c.nombre_movil}</span>
                {c.matricula && <span className="text-base text-suave">{c.matricula}</span>}
              </span>
              <button type="button" onClick={() => baja(c)} className="min-h-12 px-2 text-base font-bold text-rojo">
                Dar de baja
              </button>
            </div>
          ))}
        </Tarjeta>
      )}
      <form onSubmit={agregar} className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Agregar</h2>
        <label className="flex flex-col gap-2 font-bold">
          Nombre <span className="font-normal text-suave">Por ejemplo: Móvil 1</span>
          <input className={campo} required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Matrícula <span className="font-normal text-suave">Opcional</span>
          <input className={campo} value={matricula} onChange={(e) => setMatricula(e.target.value)} />
        </label>
        {errorAlta && <Aviso tipo="error">{errorAlta}</Aviso>}
        <Boton type="submit">Agregar</Boton>
      </form>
    </Pantalla>
  );
}
