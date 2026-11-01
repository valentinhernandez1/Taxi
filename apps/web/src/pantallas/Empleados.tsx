import { sumarMeses } from "@taxis/shared";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { AnularConMotivo } from "../anular";
import { hoyUY, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { fechaCorta, mesLargo, nuevaOpKey, pesos, useCargar } from "../datos";
import { ElegirPlata } from "../plataPago";
import type { ConceptoPago, ConQuePlata, Persona, ResumenEmpleados } from "../tipos";
import { ElegirMes } from "./Gastos";

const CONCEPTOS: { valor: ConceptoPago; texto: string; detalle: string }[] = [
  { valor: "sueldo", texto: "Sueldo", detalle: "El pago del mes" },
  { valor: "jornal", texto: "Jornal", detalle: "Por día trabajado" },
  { valor: "adelanto", texto: "Adelanto", detalle: "A cuenta del sueldo" },
  { valor: "aguinaldo", texto: "Aguinaldo", detalle: "Junio y diciembre" },
  { valor: "salario_vacacional", texto: "Salario vacacional", detalle: "Cuando se toma licencia" },
];
const textoConcepto = (c: ConceptoPago) => CONCEPTOS.find((x) => x.valor === c)!.texto;
const TIPO: Record<Persona["tipo"], string> = { dueno: "Dueño", chofer: "Chofer", telefonista: "Telefonista", otro: "Otro" };

export function Empleados() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") ?? hoyUY().slice(0, 7);
  const { datos, error, recargar } = useCargar<ResumenEmpleados>(`/empleados?mes=${mes}`);
  const nombreDe = (id: number) => datos?.personas.find((p) => p.persona_id === id)?.nombre ?? "—";

  return (
    <Pantalla titulo="Empleados y pagos" volver="/mas">
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <>
          <Tarjeta className="flex flex-col gap-1 p-4">
            <span className="font-bold text-suave">Pagos a empleados en {mesLargo(mes).toLowerCase()}</span>
            <span className="text-[32px] font-bold">{pesos(datos.total_del_mes)}</span>
          </Tarjeta>
          <Link to="/pago-empleado" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
            Anotar pago a un empleado
          </Link>

          <h2 className="m-0 text-xl font-bold">Personas</h2>
          {datos.personas.length === 0 ? (
            <p className="m-0 text-suave">No hay personas anotadas. Agregalas en Choferes y personal.</p>
          ) : (
            <Tarjeta>
              {datos.personas.map((p) => (
                <div key={p.persona_id} className="flex min-h-16 items-center gap-3 border-b border-separador px-4 py-2 last:border-b-0">
                  <span className="flex flex-1 flex-col">
                    <span className="font-bold">{p.nombre}</span>
                    <span className="text-base text-suave">{TIPO[p.tipo]}</span>
                  </span>
                  <span className="font-bold">{pesos(p.pagado_en_el_mes)}</span>
                </div>
              ))}
            </Tarjeta>
          )}

          <h2 className="m-0 text-xl font-bold">Por concepto</h2>
          <Tarjeta>
            {CONCEPTOS.map((c) => (
              <div key={c.valor} className="flex min-h-12 items-center justify-between border-b border-separador px-4 last:border-b-0">
                <span>{c.texto}</span>
                <span className="font-bold">{pesos(datos.por_concepto[c.valor])}</span>
              </div>
            ))}
          </Tarjeta>

          <Tarjeta className="flex flex-col gap-1 border-2 border-amarillo-borde bg-amarillo-fondo p-4">
            <span className="flex items-center justify-between font-bold">
              Aguinaldo acumulado <span className="rounded-lg bg-white px-2 text-base">Estimado</span>
            </span>
            <span className="text-[26px] font-bold">{pesos(datos.aguinaldo.total_estimado)}</span>
            <span className="text-base">
              Lo que se va juntando desde el {fechaCorta(datos.aguinaldo.desde)} para pagar en {datos.aguinaldo.se_paga}. Es un cálculo
              aproximado (la doceava parte de lo pagado), no un pago hecho. El importe final lo confirma el contador.
            </span>
          </Tarjeta>

          {datos.pagos.length > 0 && (
            <>
              <h2 className="m-0 text-xl font-bold">Pagos anotados</h2>
              <Tarjeta>
                {datos.pagos.map((p) => (
                  <div key={p.id} className={`flex flex-col gap-1 border-b border-separador px-4 py-3 ${p.anulado ? "opacity-60" : ""}`}>
                    <span className="flex items-start justify-between gap-3">
                      <span className={`font-bold ${p.anulado ? "line-through" : ""}`}>
                        {nombreDe(p.persona_id)} · {textoConcepto(p.concepto)}
                      </span>
                      <span className={`font-bold ${p.anulado ? "line-through" : ""}`}>{pesos(p.importe)}</span>
                    </span>
                    <span className="text-base text-suave">
                      {fechaCorta(p.fecha)} · de {mesLargo(p.periodo).toLowerCase()}
                    </span>
                    {p.anulado ? (
                      <span className="text-base font-bold text-rojo">Anulado: {p.motivo_anulacion}</span>
                    ) : (
                      <AnularConMotivo ruta={`/empleados/pagos/${p.id}/anular`} alAnular={recargar} />
                    )}
                  </div>
                ))}
              </Tarjeta>
            </>
          )}
        </>
      )}
    </Pantalla>
  );
}

type Paso = "persona" | "concepto" | "mes" | "importe" | "plata" | "resumen" | "listo";

/** Pago a un empleado: a quién, qué, de qué mes, cuánto y con qué plata. */
export function PagoEmpleado() {
  const navegar = useNavigate();
  const { datos } = useCargar<{ personas: Persona[] }>("/personas");
  const personas = datos?.personas.filter((p) => p.tipo !== "dueno") ?? [];
  const [paso, setPaso] = useState<Paso>("persona");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [concepto, setConcepto] = useState<ConceptoPago | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [plata, setPlata] = useState<ConQuePlata | null>(null);
  const [textoPlata, setTextoPlata] = useState("");
  const [opKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { importe, error: errorImporte } = leerImporte(texto);
  const orden: Paso[] = ["persona", "concepto", "mes", "importe", "plata", "resumen"];
  const indice = orden.indexOf(paso);
  const actual = hoyUY().slice(0, 7);

  async function guardar() {
    if (!persona || !concepto || !mes || !importe || !plata) return;
    setError(null);
    setGuardando(true);
    try {
      await api("/empleados/pagos", {
        metodo: "POST",
        cuerpo: { op_key: opKey, persona_id: persona.id, concepto, periodo: mes, importe, fecha: hoyUY(), pagado_con: plata },
      });
      setPaso("listo");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (paso === "listo") {
    return (
      <MarcoAsistente titulo="Pago a un empleado">
        <Pregunta>Pago guardado</Pregunta>
        <Aviso tipo="bien">
          {persona?.nombre}: {pesos(importe ?? 0)} de {textoPlata}.
        </Aviso>
        <Boton onClick={() => navegar("/mas/empleados")}>Ver empleados y pagos</Boton>
        <Boton variante="secundario" onClick={() => navegar("/")}>
          Volver al inicio
        </Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Pago a un empleado" paso={indice + 1} total={orden.length} onAtras={indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined}>
      {paso === "persona" && (
        <>
          <Pregunta>¿A quién le pagás?</Pregunta>
          {personas.map((p) => (
            <Opcion key={p.id} elegida={persona?.id === p.id} detalle={TIPO[p.tipo]} onClick={() => (setPersona(p), setPaso("concepto"))}>
              {p.nombre}
            </Opcion>
          ))}
          <Link to="/mas/personas" className="min-h-12 font-bold text-azul">
            ¿Falta alguien? Agregalo en Choferes y personal
          </Link>
        </>
      )}
      {paso === "concepto" && (
        <>
          <Pregunta>¿Qué le pagás?</Pregunta>
          {CONCEPTOS.map((c) => (
            <Opcion key={c.valor} elegida={concepto === c.valor} detalle={c.detalle} onClick={() => (setConcepto(c.valor), setPaso("mes"))}>
              {c.texto}
            </Opcion>
          ))}
        </>
      )}
      {paso === "mes" && (
        <>
          <Pregunta>¿De qué mes es?</Pregunta>
          {[actual, sumarMeses(actual, -1)].map((m, i) => (
            <Opcion key={m} elegida={mes === m} detalle={i === 0 ? "Este mes" : "El mes pasado"} onClick={() => (setMes(m), setPaso("importe"))}>
              {mesLargo(m)}
            </Opcion>
          ))}
        </>
      )}
      {paso === "importe" && (
        <>
          <Pregunta>¿Cuánto?</Pregunta>
          <TecladoImporte texto={texto} onCambio={setTexto} error={errorImporte} />
          <Boton disabled={!importe} onClick={() => setPaso("plata")}>
            Siguiente
          </Boton>
        </>
      )}
      {paso === "plata" && (
        <>
          <Pregunta>¿Con qué plata?</Pregunta>
          <ElegirPlata elegida={plata} onElegir={(p, t) => (setPlata(p), setTextoPlata(t), setPaso("resumen"))} />
        </>
      )}
      {paso === "resumen" && persona && concepto && mes && importe && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4 text-xl">
            <p className="m-0">
              <strong>{textoConcepto(concepto)}</strong> de {mesLargo(mes).toLowerCase()} a <strong>{persona.nombre}</strong> por{" "}
              <strong>{pesos(importe)}</strong>.
            </p>
            <p className="m-0 font-bold">Sale de {textoPlata}, hoy.</p>
          </Tarjeta>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}
