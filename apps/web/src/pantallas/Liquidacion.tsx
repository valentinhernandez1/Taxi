import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { hoyUY, leerImporte, MarcoAsistente, Opcion, Pregunta, TecladoImporte } from "../asistente";
import { Aviso, Boton, Tarjeta } from "../componentes";
import { fechaCorta, nuevaOpKey, pesos, useCargar } from "../datos";
import type { Categoria, ChoferResumen, CuentaDelTurno } from "../tipos";
import { textoRegla } from "./Choferes";

type Paso = "chofer" | "viajes" | "gasto" | "monto" | "cuenta" | "entrega" | "nota" | "resumen" | "listo";

function Fila({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "text-xl font-bold" : ""}`}>
      <span>{texto}</span>
      <span className="whitespace-nowrap">{valor}</span>
    </div>
  );
}

/** "Noche del Móvil 1|2026-10-31" → "noche del Móvil 1 (31 de octubre)". */
function textoTurno(t: string): string {
  const [descripcion = "", fecha = ""] = t.split("|");
  const [turno = "", ...coche] = descripcion.split(" del ");
  return `${turno.toLowerCase()} del ${coche.join(" del ")} (${fechaCorta(fecha)})`;
}

/** Flujo 4: liquidación al terminar el turno, una pregunta por pantalla. */
export function Liquidacion() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const elegidoAntes = params.get("chofer") ? Number(params.get("chofer")) : null;
  const [paso, setPaso] = useState<Paso>(elegidoAntes ? "viajes" : "chofer");
  const [choferId, setChoferId] = useState<number | null>(elegidoAntes);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [textoGasto, setTextoGasto] = useState("");
  const [textoEntrega, setTextoEntrega] = useState("");
  const [nota, setNota] = useState("");
  const [opKey, setOpKey] = useState(nuevaOpKey);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fecha = hoyUY();

  const { datos: lista } = useCargar<{ choferes: ChoferResumen[] }>("/choferes");
  const { datos: cats } = useCargar<{ categorias: Categoria[] }>("/categorias");
  const gasto = categoria ? leerImporte(textoGasto) : { importe: null, error: null };
  const montoGasto = gasto.importe ?? 0;
  const { datos: turno } = useCargar<CuentaDelTurno>(choferId ? `/liquidaciones/cuenta?chofer_id=${choferId}&fecha=${fecha}&gastos=${montoGasto}` : null);
  const entrega = leerImporte(textoEntrega);
  const entregado = textoEntrega.trim() === "0" ? 0 : entrega.importe;

  const conViajes = lista?.choferes.filter((c) => c.viajes_sin_liquidar > 0) ?? [];
  const cuenta = turno?.cuenta ?? null;
  const pagaEmpresa = (cuenta?.esperado ?? 0) < 0;
  const diferencia = cuenta && entregado != null && !pagaEmpresa ? cuenta.esperado - entregado : 0;
  const nombre = turno?.chofer.nombre ?? lista?.choferes.find((c) => c.id === choferId)?.nombre ?? "";
  const categoriasTurno = (cats?.categorias ?? []).filter((c) => c.activa && (c.nombre === "Combustible" || c.nombre === "Otro gasto"));

  const orden: Paso[] = [
    ...(elegidoAntes ? [] : (["chofer"] as Paso[])),
    "viajes",
    "gasto",
    ...(categoria ? (["monto"] as Paso[]) : []),
    "cuenta",
    ...(pagaEmpresa ? [] : (["entrega"] as Paso[])),
    ...(diferencia !== 0 ? (["nota"] as Paso[]) : []),
    "resumen",
  ];
  const indice = orden.indexOf(paso);
  const atras = indice > 0 ? () => setPaso(orden[indice - 1]!) : undefined;

  async function guardar() {
    if (!choferId || !cuenta) return;
    setError(null);
    setGuardando(true);
    try {
      await api("/liquidaciones", {
        metodo: "POST",
        cuerpo: {
          op_key: opKey,
          chofer_id: choferId,
          fecha,
          gasto: categoria && gasto.importe ? { categoria_id: categoria.id, importe: gasto.importe } : null,
          entregado: pagaEmpresa ? null : entregado,
          nota: diferencia !== 0 ? nota.trim() : null,
          pagado_con: pagaEmpresa ? { desde: "caja" } : null,
        },
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
      <MarcoAsistente titulo="Liquidación">
        <Pregunta>Turno de {nombre} cerrado</Pregunta>
        <Aviso tipo="bien">Queda guardado. Para cambiarlo después hay que anularlo con el motivo.</Aviso>
        <Boton onClick={() => navegar("/")}>Volver al inicio</Boton>
        <Boton
          variante="secundario"
          onClick={() => {
            setChoferId(null);
            setCategoria(null);
            setTextoGasto("");
            setTextoEntrega("");
            setNota("");
            setOpKey(nuevaOpKey());
            navegar("/liquidacion", { replace: true });
            setPaso("chofer");
          }}
        >
          Liquidar otro chofer
        </Boton>
      </MarcoAsistente>
    );
  }

  return (
    <MarcoAsistente titulo="Liquidación" paso={indice + 1} total={orden.length} onAtras={atras}>
      {paso === "chofer" && (
        <>
          <Pregunta ayuda="Aparecen los que tienen viajes sin liquidar.">¿Qué chofer terminó el turno?</Pregunta>
          {!lista && <p className="text-suave">Cargando…</p>}
          {lista && conViajes.length === 0 && <Aviso tipo="bien">Nadie tiene viajes sin liquidar.</Aviso>}
          {conViajes.map((c) => (
            <Opcion
              key={c.id}
              elegida={choferId === c.id}
              detalle={
                c.ultimo_turno
                  ? `Terminó el turno ${textoTurno(c.ultimo_turno)} · ${c.viajes_sin_liquidar} viajes`
                  : `${c.viajes_sin_liquidar} viajes${c.sin_liquidar_desde ? ` desde el ${fechaCorta(c.sin_liquidar_desde)}` : ""}`
              }
              onClick={() => (setChoferId(c.id), setPaso("viajes"))}
            >
              {c.nombre}
            </Opcion>
          ))}
        </>
      )}

      {paso === "viajes" && (
        <>
          <Pregunta ayuda={`Compará con el papel de ${nombre}.`}>¿Están todos los viajes?</Pregunta>
          {!turno ? (
            <p className="text-suave">Cargando…</p>
          ) : (
            <>
              {turno.turnos.length > 0 && (
                <p className="m-0 text-suave">
                  {turno.turnos.map((t) => `Turno ${t.turno.toLowerCase()} del ${t.coche}, ${fechaCorta(t.fecha)}`).join(" · ")}
                </p>
              )}
              <Tarjeta className="flex flex-col gap-2 p-4 text-lg">
                <Fila texto={`${turno.viajes.cantidades.efectivo} en efectivo`} valor={pesos(turno.viajes.totales.efectivo)} />
                <Fila texto={`${turno.viajes.cantidades.tarjeta} con tarjeta`} valor={pesos(turno.viajes.totales.tarjeta)} />
                <Fila texto={`${turno.viajes.cantidades.fiado} fiados`} valor={pesos(turno.viajes.totales.fiado)} />
                <Fila
                  texto="Total del turno"
                  valor={pesos(turno.viajes.totales.efectivo + turno.viajes.totales.tarjeta + turno.viajes.totales.fiado)}
                  fuerte
                />
                {turno.viajes.desde && turno.viajes.desde !== turno.viajes.hasta && (
                  <span className="text-base text-suave">
                    Viajes del {fechaCorta(turno.viajes.desde)} al {fechaCorta(turno.viajes.hasta!)}.
                  </span>
                )}
              </Tarjeta>
              {!turno.regla && (
                <Aviso tipo="error">
                  Falta cargar cómo se le paga a {nombre}.{" "}
                  <Link to={`/mas/choferes/${choferId}/regla`} className="underline">
                    Cargarlo ahora
                  </Link>
                </Aviso>
              )}
              <Boton disabled={!turno.regla} onClick={() => setPaso("gasto")}>
                Sí, están todos
              </Boton>
              <Boton variante="secundario" onClick={() => navegar("/viaje")}>
                Faltan viajes, anotarlos
              </Boton>
            </>
          )}
        </>
      )}

      {paso === "gasto" && (
        <>
          <Pregunta ayuda="Por ejemplo, si cargó combustible.">¿Pagó algo con la plata del turno?</Pregunta>
          {categoriasTurno.map((c) => (
            <Opcion key={c.id} elegida={categoria?.id === c.id} onClick={() => (setCategoria(c), setPaso("monto"))}>
              {c.nombre}
            </Opcion>
          ))}
          <Opcion elegida={false} onClick={() => (setCategoria(null), setTextoGasto(""), setPaso("cuenta"))}>
            No pagó nada
          </Opcion>
        </>
      )}

      {paso === "monto" && categoria && (
        <>
          <Pregunta ayuda="Se anota como gasto y se descuenta de lo que tiene que entregar.">
            ¿Cuánto pagó de {categoria.nombre.toLowerCase()}?
          </Pregunta>
          <TecladoImporte texto={textoGasto} onCambio={setTextoGasto} error={gasto.error} />
          <Boton disabled={!gasto.importe} onClick={() => setPaso("cuenta")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "cuenta" && turno?.regla && (
        <>
          <Pregunta ayuda={textoRegla(turno.regla)}>La cuenta de {nombre}</Pregunta>
          {!cuenta ? (
            <p className="text-suave">Calculando…</p>
          ) : (
            <>
              <Tarjeta className="flex flex-col gap-2 p-4 text-lg">
                <Fila texto="Total del turno" valor={pesos(cuenta.facturado)} />
                <Fila texto="Su parte" valor={pesos(cuenta.parte_turno + cuenta.adelanto_fiados)} />
                {cuenta.adelanto_fiados > 0 && <span className="text-base text-suave">Incluye {pesos(cuenta.adelanto_fiados)} adelantados de fiados que todavía no se cobraron.</span>}
                {cuenta.parte_fiados_cobrados > 0 && <Fila texto="Su parte de fiados que ya pagaron" valor={pesos(cuenta.parte_fiados_cobrados)} />}
                {cuenta.descuentos > 0 && <Fila texto="Descuento por fiados que no se cobran" valor={`− ${pesos(cuenta.descuentos)}`} />}
                <hr className="my-1 w-full border-separador" />
                <Fila texto="Plata que tiene" valor={pesos(turno.plata_en_mano)} />
                {montoGasto > 0 && <Fila texto="Menos lo que pagó" valor={`− ${pesos(montoGasto)}`} />}
                <Fila texto="Menos su parte" valor={`− ${pesos(cuenta.parte_total)}`} />
                <Fila texto={pagaEmpresa ? "Le tenés que pagar" : "Te tiene que entregar"} valor={pesos(Math.abs(cuenta.esperado))} fuerte />
              </Tarjeta>
              {cuenta.pendiente_fiados > 0 && (
                <p className="m-0 text-base text-suave">Su parte de los fiados de este turno ({pesos(cuenta.pendiente_fiados)}) se le paga cuando paguen los clientes.</p>
              )}
              <p className="m-0 text-base text-suave">La tarjeta queda esperando a Handy y los fiados quedan en la cuenta de cada cliente.</p>
              {!turno.regla.confirmada && <Aviso tipo="atencion">Regla sin confirmar: revisala en la ficha del chofer.</Aviso>}
              <Boton onClick={() => setPaso(pagaEmpresa ? "resumen" : "entrega")}>Siguiente</Boton>
            </>
          )}
        </>
      )}

      {paso === "entrega" && cuenta && (
        <>
          <Pregunta ayuda={`Tenía que entregar ${pesos(cuenta.esperado)}.`}>¿Cuánto entregó {nombre}?</Pregunta>
          <Boton variante="secundario" onClick={() => (setTextoEntrega(String(cuenta.esperado / 100).replace(".", ",")), setPaso("resumen"))}>
            Entregó justo ({pesos(cuenta.esperado)})
          </Boton>
          <TecladoImporte texto={textoEntrega} onCambio={setTextoEntrega} />
          {entregado != null && diferencia !== 0 && (
            <Aviso tipo="atencion">{diferencia > 0 ? `Faltan ${pesos(diferencia)}.` : `Entregó ${pesos(-diferencia)} de más.`} Queda anotado.</Aviso>
          )}
          <Boton disabled={entregado == null} onClick={() => setPaso(diferencia !== 0 ? "nota" : "resumen")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "nota" && (
        <>
          <Pregunta>¿Por qué no coincide?</Pregunta>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Por ejemplo: le faltó cambio"
            className="rounded-xl border-2 border-borde p-3 text-xl"
          />
          <Boton disabled={nota.trim().length < 3} onClick={() => setPaso("resumen")}>
            Siguiente
          </Boton>
        </>
      )}

      {paso === "resumen" && cuenta && (
        <>
          <Pregunta>¿Está bien?</Pregunta>
          <Tarjeta className="flex flex-col gap-2 p-4 text-lg">
            <p className="m-0 text-xl">
              {pagaEmpresa
                ? `A ${nombre} le pagás ${pesos(-cuenta.esperado)} de tu caja por su parte del turno.`
                : `${nombre} entregó ${pesos(entregado ?? 0)} y se quedó con su parte de ${pesos(cuenta.parte_total)}.`}
            </p>
            <Fila texto="Total del turno" valor={pesos(cuenta.facturado)} />
            <Fila texto="Su parte" valor={pesos(cuenta.parte_total)} />
            {montoGasto > 0 && <Fila texto={`${categoria?.nombre} pagado`} valor={pesos(montoGasto)} />}
            {diferencia !== 0 && <Fila texto="Diferencia" valor={diferencia > 0 ? `faltan ${pesos(diferencia)}` : `de más ${pesos(-diferencia)}`} />}
          </Tarjeta>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar liquidación"}
          </Boton>
          <Boton variante="secundario" onClick={() => setPaso("viajes")}>
            Corregir algo
          </Boton>
        </>
      )}
    </MarcoAsistente>
  );
}
