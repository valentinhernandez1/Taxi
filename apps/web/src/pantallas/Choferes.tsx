import { describirRegla } from "@taxis/shared";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { AnularConMotivo } from "../anular";
import { hoyUY, leerImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { fechaCorta, haceDias, pesos, useCargar } from "../datos";
import type { ChoferResumen, LiquidacionHecha, Regla } from "../tipos";

const campo = "min-h-14 rounded-xl border-2 border-borde bg-white px-3 text-lg font-normal";

export function textoRegla(r: Regla): string {
  return describirRegla(r, pesos);
}

function Etiqueta({ confirmada }: { confirmada: boolean }) {
  return (
    <span
      className={`rounded-lg px-2 py-0.5 text-base font-bold ${confirmada ? "bg-white text-verde ring-1 ring-verde" : "bg-amarillo-fondo text-amarillo-texto ring-1 ring-amarillo-borde"}`}
    >
      {confirmada ? "Confirmada" : "Sin confirmar"}
    </span>
  );
}

function diasDesde(dia: string): number {
  return Math.round((Date.parse(hoyUY()) - Date.parse(dia)) / 86_400_000);
}

export function Choferes() {
  const { datos, error } = useCargar<{ choferes: ChoferResumen[] }>("/choferes");
  const sinConfirmar = datos?.choferes.some((c) => !c.regla || !c.regla.confirmada) ?? false;
  return (
    <Pantalla titulo="Choferes" volver="/mas">
      <p className="m-0 -mt-2 text-suave">Cómo se le paga a cada uno, lo que tiene para entregar y sus liquidaciones.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {sinConfirmar && (
        <Aviso tipo="atencion">Hay reglas de pago sin confirmar. Revisalas antes de tomar las liquidaciones como definitivas.</Aviso>
      )}
      {datos && datos.choferes.length === 0 && <p className="m-0 text-suave">No hay choferes. Agregalos en Choferes y personal.</p>}
      {datos && datos.choferes.length > 0 && (
        <Tarjeta>
          {datos.choferes.map((c) => (
            <Link key={c.id} to={`/mas/choferes/${c.id}`} className="flex flex-col gap-1 border-b border-separador px-4 py-3 last:border-b-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold">{c.nombre}</span>
                {c.regla ? <Etiqueta confirmada={c.regla.confirmada} /> : <span className="font-bold text-rojo">Sin regla</span>}
              </span>
              <span className="text-base text-suave">
                Para entregar <strong className="text-tinta">{pesos(c.para_entregar)}</strong>
                {c.viajes_sin_liquidar > 0 && c.sin_liquidar_desde
                  ? ` · ${c.viajes_sin_liquidar} viajes sin liquidar (desde ${haceDias(diasDesde(c.sin_liquidar_desde))})`
                  : ""}
              </span>
            </Link>
          ))}
        </Tarjeta>
      )}
      <Link to="/liquidacion" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
        Liquidar un turno
      </Link>
      <Link to="/mas/personas" className="min-h-12 font-bold text-azul">
        Agregar o dar de baja choferes ›
      </Link>
    </Pantalla>
  );
}

export function FichaChofer() {
  const { id = "" } = useParams();
  const { datos, error, recargar } = useCargar<{
    chofer: ChoferResumen;
    reglas: Regla[];
    liquidaciones: LiquidacionHecha[];
    pendiente_fiados: number;
  }>(`/choferes/${id}`);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);
  if (error) {
    return (
      <Pantalla titulo="Chofer" volver="/mas/choferes">
        <Aviso tipo="error">{error}</Aviso>
      </Pantalla>
    );
  }
  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  const { chofer, reglas, liquidaciones } = datos;
  const vigente = chofer.regla;
  const futuras = reglas.filter((r) => r.vigente_desde > hoyUY());

  async function confirmar(r: Regla) {
    setErrorConfirmar(null);
    try {
      await api(`/reglas/${r.id}/confirmar`, { metodo: "POST", cuerpo: {} });
      recargar();
    } catch (e) {
      setErrorConfirmar(mensajeDeError(e));
    }
  }

  return (
    <Pantalla titulo={chofer.nombre} volver="/mas/choferes">
      <Tarjeta className="flex flex-col gap-2 p-4">
        <span className="flex items-center justify-between gap-2">
          <span className="font-bold text-suave">Cómo se le paga</span>
          {vigente && <Etiqueta confirmada={vigente.confirmada} />}
        </span>
        {vigente ? (
          <>
            <span className="text-xl">{textoRegla(vigente)}</span>
            <span className="text-base text-suave">
              Desde el {fechaCorta(vigente.vigente_desde)}. Si un fiado no se cobra, lo pierde {vigente.incobrable === "empresa" ? "la empresa" : "el chofer"}.
            </span>
            {!vigente.confirmada && (
              <>
                <Aviso tipo="atencion">Esta regla está sin confirmar. Confirmala cuando estés seguro de que es así.</Aviso>
                <Boton onClick={() => confirmar(vigente)}>Sí, es así: confirmar</Boton>
              </>
            )}
          </>
        ) : (
          <Aviso tipo="atencion">Todavía no cargaste cómo se le paga. Sin eso no se puede liquidar.</Aviso>
        )}
        {errorConfirmar && <Aviso tipo="error">{errorConfirmar}</Aviso>}
        <Link to={`/mas/choferes/${chofer.id}/regla`} className="flex min-h-14 items-center justify-center rounded-xl border-2 border-azul font-bold text-azul">
          {vigente ? "Cambiar cómo se le paga" : "Cargar cómo se le paga"}
        </Link>
      </Tarjeta>

      {futuras.map((r) => (
        <Aviso key={r.id} tipo="atencion">
          Desde el {fechaCorta(r.vigente_desde)}: {textoRegla(r)}
        </Aviso>
      ))}

      <Tarjeta className="flex flex-col gap-1 p-4">
        <span className="font-bold text-suave">Tiene para entregar</span>
        <span className="text-[28px] font-bold">{pesos(chofer.para_entregar)}</span>
        {datos.pendiente_fiados > 0 && (
          <span className="text-base">Se le deben {pesos(datos.pendiente_fiados)} de fiados, para cuando paguen los clientes.</span>
        )}
      </Tarjeta>

      {chofer.viajes_sin_liquidar > 0 && (
        <Link to={`/liquidacion?chofer=${chofer.id}`} className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
          Liquidar su turno ({chofer.viajes_sin_liquidar} viajes)
        </Link>
      )}

      <h2 className="m-0 text-xl font-bold">Liquidaciones</h2>
      {liquidaciones.length === 0 ? (
        <p className="m-0 text-suave">Todavía no hay liquidaciones.</p>
      ) : (
        <Tarjeta>
          {liquidaciones.map((l) => (
            <div key={l.id} className={`flex flex-col gap-1 border-b border-separador px-4 py-3 ${l.estado === "anulada" ? "opacity-60" : ""}`}>
              <span className="flex items-start justify-between gap-3">
                <span className={`font-bold ${l.estado === "anulada" ? "line-through" : ""}`}>Turno del {fechaCorta(l.fecha)}</span>
                <span className={`font-bold ${l.estado === "anulada" ? "line-through" : ""}`}>{pesos(l.facturado)}</span>
              </span>
              <span className="text-base text-suave">
                Su parte {pesos(l.parte_chofer)}
                {l.adelantos_fiado > 0 ? ` (adelanto de fiados ${pesos(l.adelantos_fiado)})` : ""}
                {l.gastos > 0 ? ` · pagó ${pesos(l.gastos)}` : ""} ·{" "}
                {l.esperado >= 0 ? `entregó ${pesos(l.entregado)}` : `le pagaste ${pesos(-l.esperado)}`}
              </span>
              {l.diferencia !== 0 && (
                <span className="text-base font-bold text-amarillo-texto">
                  {l.diferencia > 0 ? `Faltaron ${pesos(l.diferencia)}` : `Entregó ${pesos(-l.diferencia)} de más`}: {l.nota}
                </span>
              )}
              {!l.regla_confirmada && l.estado !== "anulada" && <span className="text-base font-bold text-amarillo-texto">Con regla sin confirmar</span>}
              {l.estado === "anulada" ? (
                <span className="text-base font-bold text-rojo">Anulada: {l.motivo_anulacion}</span>
              ) : (
                <AnularConMotivo ruta={`/liquidaciones/${l.id}/anular`} alAnular={recargar} />
              )}
            </div>
          ))}
        </Tarjeta>
      )}
    </Pantalla>
  );
}

export function ReglaForm() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { datos } = useCargar<{ chofer: ChoferResumen }>(`/choferes/${id}`);
  const actual = datos?.chofer.regla ?? null;
  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  return <FormularioRegla key={actual?.id ?? 0} choferId={Number(id)} nombre={datos.chofer.nombre} actual={actual} alGuardar={() => navegar(`/mas/choferes/${id}`)} />;
}

function FormularioRegla({ choferId, nombre, actual, alGuardar }: { choferId: number; nombre: string; actual: Regla | null; alGuardar: () => void }) {
  const [tipo, setTipo] = useState<Regla["tipo"]>(actual?.tipo ?? "porcentaje");
  const [porcentaje, setPorcentaje] = useState(actual?.porcentaje_puntos != null ? String(actual.porcentaje_puntos / 100).replace(".", ",") : "30");
  const [jornal, setJornal] = useState(actual?.jornal != null ? String(actual.jornal / 100).replace(".", ",") : "");
  const [modo, setModo] = useState<Regla["modo_entrega"]>(actual?.modo_entrega ?? "se_queda_su_parte");
  const [momento, setMomento] = useState<Regla["momento_fiado"]>(actual?.momento_fiado ?? "A");
  const [incobrable, setIncobrable] = useState<Regla["incobrable"]>(actual?.incobrable ?? "empresa");
  const [desde, setDesde] = useState(actual ? hoyUY() : `${hoyUY().slice(0, 7)}-01`);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const usaPct = tipo === "porcentaje" || tipo === "mixto";
  const usaJornal = tipo === "jornal" || tipo === "mixto";

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const pct = Number(porcentaje.replace(",", "."));
    if (usaPct && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return setError("El porcentaje va de 0 a 100");
    const j = leerImporte(jornal);
    if (usaJornal && !j.importe) return setError(j.error ?? "Poné cuánto cobra por turno");
    setGuardando(true);
    try {
      await api("/reglas", {
        metodo: "POST",
        cuerpo: {
          chofer_id: choferId,
          tipo,
          porcentaje_puntos: usaPct ? Math.round(pct * 100) : null,
          jornal: usaJornal ? j.importe : null,
          modo_entrega: modo,
          momento_fiado: momento,
          incobrable,
          vigente_desde: desde,
        },
      });
      alGuardar();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const radio = <T extends string>(nombreGrupo: string, valor: T, elegido: T, set: (v: T) => void, texto: string, detalle?: string) => (
    <label key={valor} className={`flex min-h-14 items-start gap-3 rounded-xl border-2 p-3 ${valor === elegido ? "border-azul bg-azul-claro" : "border-borde bg-white"}`}>
      <input type="radio" name={nombreGrupo} className="mt-1 h-6 w-6" checked={valor === elegido} onChange={() => set(valor)} />
      <span className="flex flex-col">
        <span className="font-bold">{texto}</span>
        {detalle && <span className="text-base text-suave">{detalle}</span>}
      </span>
    </label>
  );

  return (
    <Pantalla titulo={`Cómo se le paga a ${nombre}`} volver={`/mas/choferes/${choferId}`}>
      <form onSubmit={guardar} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xl font-bold">¿Cómo cobra?</legend>
          {radio("tipo", "porcentaje", tipo, setTipo, "Un porcentaje de lo que hace")}
          {radio("tipo", "jornal", tipo, setTipo, "Un fijo por turno (jornal)")}
          {radio("tipo", "mixto", tipo, setTipo, "Un fijo por turno más un porcentaje")}
          {radio("tipo", "sueldo", tipo, setTipo, "Sueldo", "Se le paga en Empleados y pagos, no en cada turno")}
        </fieldset>
        {usaPct && (
          <label className="flex flex-col gap-2 font-bold">
            Porcentaje
            <span className="flex items-center gap-2">
              <input className={`${campo} w-32`} inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
              <span className="text-xl">%</span>
            </span>
          </label>
        )}
        {usaJornal && (
          <label className="flex flex-col gap-2 font-bold">
            ¿Cuánto por turno?
            <input className={campo} inputMode="decimal" value={jornal} onChange={(e) => setJornal(e.target.value)} placeholder="0" />
          </label>
        )}
        {tipo !== "sueldo" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-bold">¿Cómo entrega la plata?</legend>
            {radio("modo", "se_queda_su_parte", modo, setModo, "Se queda con su parte", "Entrega lo que juntó menos su parte")}
            {radio("modo", "entrega_todo", modo, setModo, "Entrega todo y se le paga", "Te da todo y vos le pagás su parte")}
          </fieldset>
        )}
        {usaPct && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-bold">¿Cuándo cobra su parte de los fiados?</legend>
            {radio("momento", "A", momento, setMomento, "En la liquidación", "Se le adelanta aunque el cliente no haya pagado")}
            {radio("momento", "B", momento, setMomento, "Cuando el cliente paga", "Se le paga en la liquidación siguiente al pago")}
          </fieldset>
        )}
        {usaPct && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xl font-bold">Si un fiado no se cobra nunca…</legend>
            {radio("incobrable", "empresa", incobrable, setIncobrable, "Lo pierde la empresa")}
            {radio("incobrable", "chofer", incobrable, setIncobrable, "Se le descuenta al chofer")}
          </fieldset>
        )}
        <label className="flex flex-col gap-2 font-bold">
          ¿Desde qué día rige?
          <span className="font-normal text-suave">Las liquidaciones de antes quedan con la regla que tenían.</span>
          <input className={campo} type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <Aviso tipo="atencion">Queda “sin confirmar” hasta que la confirmes en la ficha del chofer.</Aviso>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </form>
    </Pantalla>
  );
}
