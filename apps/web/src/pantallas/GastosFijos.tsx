import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { hoyUY, leerImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { mesLargo, pesos, useCargar } from "../datos";
import type { Categoria, Coche, Frecuencia, GastoFijo } from "../tipos";

const campo = "min-h-14 rounded-xl border-2 border-borde bg-white px-3 text-lg font-normal";
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const FRECUENCIAS: { valor: Frecuencia; texto: string }[] = [
  { valor: "mensual", texto: "Todos los meses" },
  { valor: "bimestral", texto: "Cada dos meses" },
  { valor: "anual", texto: "Una vez por año" },
  { valor: "meses_especificos", texto: "Solo algunos meses" },
];

function cadaCuanto(f: GastoFijo): string {
  const base = FRECUENCIAS.find((x) => x.valor === f.frecuencia)?.texto ?? "";
  const meses = f.frecuencia === "meses_especificos" && f.meses ? ` (${f.meses.map((m) => MESES[m - 1]).join(", ")})` : "";
  return `${base}${meses}, el día ${f.dia_del_mes}`;
}

export function GastosFijos() {
  const { datos, error } = useCargar<{ gastos_fijos: GastoFijo[] }>("/gastos-fijos");
  return (
    <Pantalla titulo="Gastos fijos" volver="/mas">
      <p className="m-0 -mt-2 text-suave">Lo que se paga siempre (BPS, UTE, seguro, cuotas…). La app te avisa antes de que venza.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.gastos_fijos.length === 0 && <p className="m-0 text-suave">Todavía no hay gastos fijos.</p>}
      {datos && datos.gastos_fijos.length > 0 && (
        <Tarjeta>
          {datos.gastos_fijos.map((f) => (
            <Link key={f.id} to={`/mas/gastos-fijos/${f.id}`} className={`flex flex-col gap-0.5 border-b border-separador px-4 py-3 ${f.activo ? "" : "opacity-60"}`}>
              <span className="flex items-start justify-between gap-3">
                <span className="font-bold">{f.descripcion}</span>
                <span className="font-bold whitespace-nowrap">{f.importe == null ? "—" : `${f.importe_estimado ? "≈ " : ""}${pesos(f.importe)}`}</span>
              </span>
              <span className="text-base text-suave">
                {[f.categoria, f.coche].filter(Boolean).join(" · ")} · {cadaCuanto(f)}
              </span>
              {f.cuotas_total != null && (
                <span className="text-base text-suave">
                  Cuotas pagadas: {f.cuotas_pagadas} de {f.cuotas_total}
                </span>
              )}
              {!f.activo && <span className="text-base font-bold text-suave">Dado de baja</span>}
            </Link>
          ))}
        </Tarjeta>
      )}
      <Link to="/mas/gastos-fijos/nuevo" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
        Agregar gasto fijo
      </Link>
    </Pantalla>
  );
}

export function GastoFijoForm() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { datos: lista } = useCargar<{ gastos_fijos: GastoFijo[] }>(id ? "/gastos-fijos" : null);
  const existente = id ? lista?.gastos_fijos.find((f) => f.id === Number(id)) : null;
  if (id && !lista) return <p className="p-6 text-suave">Cargando…</p>;
  if (id && !existente) {
    return (
      <Pantalla titulo="Gasto fijo" volver="/mas/gastos-fijos">
        <Aviso tipo="error">Ese gasto fijo no existe.</Aviso>
      </Pantalla>
    );
  }
  return <Formulario existente={existente ?? null} alGuardar={() => navegar("/mas/gastos-fijos")} />;
}

function Formulario({ existente, alGuardar }: { existente: GastoFijo | null; alGuardar: () => void }) {
  const { datos: cats } = useCargar<{ categorias: Categoria[] }>("/categorias");
  const { datos: coches } = useCargar<{ coches: Coche[] }>("/coches");
  const [descripcion, setDescripcion] = useState(existente?.descripcion ?? "");
  const [categoriaId, setCategoriaId] = useState<number | "">(existente?.categoria_id ?? "");
  const [cocheId, setCocheId] = useState<number | "">(existente?.coche_id ?? "");
  const [texto, setTexto] = useState(existente?.importe != null ? String(existente.importe / 100).replace(".", ",") : "");
  const [estimado, setEstimado] = useState(existente?.importe_estimado ?? false);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(existente?.frecuencia ?? "mensual");
  const [meses, setMeses] = useState<number[]>(existente?.meses ?? []);
  const [dia, setDia] = useState(String(existente?.dia_del_mes ?? 10));
  const [primer, setPrimer] = useState(existente?.primer_periodo ?? hoyUY().slice(0, 7));
  const [cuotas, setCuotas] = useState(existente?.cuotas_total != null ? String(existente.cuotas_total) : "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const categoria = cats?.categorias.find((c) => c.id === categoriaId);
  const { importe, error: errorImporte } = leerImporte(texto);

  async function guardar(e: FormEvent, activo?: boolean) {
    e.preventDefault();
    setError(null);
    if (texto.trim() && !importe) return setError(errorImporte ?? "Revisá el importe");
    setGuardando(true);
    try {
      const cuerpo = {
        descripcion,
        categoria_id: categoriaId === "" ? undefined : categoriaId,
        coche_id: cocheId === "" ? null : cocheId,
        importe: importe ?? null,
        importe_estimado: estimado,
        frecuencia,
        meses: frecuencia === "meses_especificos" ? meses : null,
        dia_del_mes: Number(dia),
        primer_periodo: primer,
        cuotas_total: cuotas.trim() ? Number(cuotas) : null,
        ...(activo === undefined ? {} : { activo }),
      };
      if (existente) await api(`/gastos-fijos/${existente.id}`, { metodo: "PUT", cuerpo });
      else await api("/gastos-fijos", { metodo: "POST", cuerpo });
      alGuardar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Pantalla titulo={existente ? "Cambiar gasto fijo" : "Nuevo gasto fijo"} volver="/mas/gastos-fijos">
      <form onSubmit={(e) => guardar(e)} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 font-bold">
          ¿Qué es?
          <span className="font-normal text-suave">Por ejemplo: Aporte BPS, UTE de la base, Cuota Móvil 2</span>
          <input className={campo} required maxLength={80} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Tipo de gasto
          <select className={campo} required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Elegí…</option>
            {cats?.categorias
              .filter((c) => c.activa || c.id === categoriaId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </label>
        {(categoria?.es_de_coche || cocheId !== "") && (
          <label className="flex flex-col gap-2 font-bold">
            ¿De qué coche?
            <select className={campo} value={cocheId} onChange={(e) => setCocheId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{categoria?.es_cuota_vehiculo ? "Elegí…" : "De ninguno en especial"}</option>
              {coches?.coches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_movil}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-2 font-bold">
          ¿Cuánto? <span className="font-normal text-suave">Si cambia todos los meses, poné uno aproximado</span>
          <input className={campo} inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="0" />
        </label>
        <label className="flex min-h-12 items-center gap-3 font-bold">
          <input type="checkbox" className="h-7 w-7" checked={estimado} onChange={(e) => setEstimado(e.target.checked)} />
          Es aproximado (cuando lo pagás, ponés el real)
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">¿Cada cuánto vence?</legend>
          {FRECUENCIAS.map((f) => (
            <label key={f.valor} className="flex min-h-12 items-center gap-3 text-lg">
              <input type="radio" name="frecuencia" className="h-6 w-6" checked={frecuencia === f.valor} onChange={() => setFrecuencia(f.valor)} />
              {f.texto}
            </label>
          ))}
        </fieldset>
        {frecuencia === "meses_especificos" && (
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Meses">
            {MESES.map((m, i) => {
              const elegido = meses.includes(i + 1);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setMeses(elegido ? meses.filter((x) => x !== i + 1) : [...meses, i + 1].sort((a, b) => a - b))}
                  className={`min-h-12 rounded-xl border-2 font-bold ${elegido ? "border-azul bg-azul text-white" : "border-borde bg-white"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
        <label className="flex flex-col gap-2 font-bold">
          ¿Qué día del mes vence?
          <input className={campo} type="number" min={1} max={31} required value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          ¿Desde qué mes? <span className="font-normal text-suave">{/^\d{4}-\d{2}$/.test(primer) ? mesLargo(primer) : ""}</span>
          <input className={campo} type="month" required value={primer} onChange={(e) => setPrimer(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          ¿Cuántas cuotas son? <span className="font-normal text-suave">Solo si termina (por ejemplo, la compra de un coche). Si no, dejalo vacío.</span>
          <input className={campo} type="number" min={1} value={cuotas} onChange={(e) => setCuotas(e.target.value)} />
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
        {existente && (
          <Boton type="button" variante={existente.activo ? "peligro" : "secundario"} disabled={guardando} onClick={(e) => guardar(e, !existente.activo)}>
            {existente.activo ? "Dar de baja (no avisa más)" : "Volver a activarlo"}
          </Boton>
        )}
      </form>
    </Pantalla>
  );
}

export function Categorias() {
  const { datos, error, recargar } = useCargar<{ categorias: Categoria[] }>("/categorias");
  const [nombre, setNombre] = useState("");
  const [deCoche, setDeCoche] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setErrorAlta(null);
    try {
      await api("/categorias", { metodo: "POST", cuerpo: { nombre, es_de_coche: deCoche } });
      setNombre("");
      setDeCoche(false);
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  async function cambiar(c: Categoria, activa: boolean) {
    try {
      await api(`/categorias/${c.id}`, { metodo: "PUT", cuerpo: { activa } });
      recargar();
    } catch (err) {
      setErrorAlta(mensajeDeError(err));
    }
  }

  return (
    <Pantalla titulo="Tipos de gasto" volver="/mas">
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <Tarjeta>
          {datos.categorias.map((c) => (
            <div key={c.id} className={`flex min-h-16 items-center gap-3 border-b border-separador px-4 last:border-b-0 ${c.activa ? "" : "opacity-60"}`}>
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{c.nombre}</span>
                <span className="text-base text-suave">
                  {c.es_cuota_vehiculo ? "Cuota de coche (va aparte)" : c.es_de_coche ? "De un coche" : "General"}
                </span>
              </span>
              <button type="button" onClick={() => cambiar(c, !c.activa)} className={`min-h-12 px-2 text-base font-bold ${c.activa ? "text-rojo" : "text-azul"}`}>
                {c.activa ? "Ocultar" : "Volver a usar"}
              </button>
            </div>
          ))}
        </Tarjeta>
      )}
      <form onSubmit={agregar} className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">Agregar</h2>
        <label className="flex flex-col gap-2 font-bold">
          Nombre <span className="font-normal text-suave">Por ejemplo: Peajes</span>
          <input className={campo} required maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="flex min-h-12 items-center gap-3 font-bold">
          <input type="checkbox" className="h-7 w-7" checked={deCoche} onChange={(e) => setDeCoche(e.target.checked)} />
          Es un gasto de un coche
        </label>
        {errorAlta && <Aviso tipo="error">{errorAlta}</Aviso>}
        <Boton type="submit">Agregar</Boton>
      </form>
    </Pantalla>
  );
}
