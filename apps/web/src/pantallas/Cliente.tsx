import { mensajeRecordatorio, telefonoWhatsApp } from "@taxis/shared";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { useAjustes } from "../ajustes";
import { AnularConMotivo } from "../anular";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { fechaCorta, haceDias, pesos, useCargar } from "../datos";
import { FotosComprobante } from "../fotos";
import type { FichaCliente, ItemHistorial } from "../tipos";
import { COLOR_NIVEL } from "./QuienDebe";

export function Cliente() {
  const { id = "" } = useParams();
  const { datos, error, recargar } = useCargar<FichaCliente>(`/clientes/${id}`);
  if (error) {
    return (
      <Pantalla titulo="Cliente" volver="/deben">
        <Aviso tipo="error">{error}</Aviso>
      </Pantalla>
    );
  }
  if (!datos) return <p className="p-6 text-suave">Cargando…</p>;
  const { cliente, historial } = datos;
  const vigentes = historial.filter((h) => !h.anulado);
  const totalViajes = vigentes.filter((h) => h.tipo === "fiado").reduce((s, h) => s + h.importe, 0);
  const totalPagos = vigentes.filter((h) => h.tipo === "cobro").reduce((s, h) => s + h.importe, 0);
  const totalPerdido = vigentes.reduce((s, h) => s + (h.incobrable?.importe ?? 0), 0);

  return (
    <Pantalla titulo={cliente.nombre} volver="/deben">
      <p className="m-0 -mt-3 text-suave">{[cliente.telefono, cliente.observaciones].filter(Boolean).join(" · ") || "Sin teléfono anotado"}</p>

      <Tarjeta className="flex flex-col gap-1 p-4">
        <span className="font-bold text-suave">Debe hoy</span>
        <span className={`text-[32px] font-bold ${COLOR_NIVEL[cliente.nivel]}`}>{pesos(cliente.debe)}</span>
        {cliente.antiguedad_dias !== null && <span>Lo más viejo es de {haceDias(cliente.antiguedad_dias)}</span>}
        {cliente.plazo_dias && <span className="text-suave">Plazo para pagar: {cliente.plazo_dias} días</span>}
        {cliente.a_favor > 0 && <span className="font-bold text-verde">Tiene {pesos(cliente.a_favor)} a favor</span>}
      </Tarjeta>

      <div className="flex flex-col gap-3">
        <Link to={`/cobro?cliente=${cliente.id}`} className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
          Anotar cobro
        </Link>
        <Link to={`/fiado?cliente=${cliente.id}`} className="flex min-h-16 items-center justify-center rounded-[14px] border-2 border-azul bg-white text-xl font-bold text-azul">
          Anotar fiado
        </Link>
      </div>

      {cliente.limite_fiado !== null && (
        <Tarjeta className="flex flex-col gap-1 p-4">
          <span className="font-bold">Límite de fiado {pesos(cliente.limite_fiado)}</span>
          <span className="text-suave">
            {cliente.debe >= cliente.limite_fiado
              ? "Llegó al límite. Si le fiás más, la app te avisa antes de anotarlo."
              : `Puede fiar ${pesos(cliente.limite_fiado - cliente.debe)} más. Si se pasa, la app te avisa antes de anotar el fiado.`}
          </span>
        </Tarjeta>
      )}

      {cliente.debe > 0 && <Recordatorio ficha={datos} alEnviar={recargar} />}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-xl font-bold">Viajes y pagos</h2>
        <p className="m-0 text-suave">Los pagos se descuentan primero de lo más viejo.</p>
        {historial.length === 0 ? (
          <p className="m-0 text-suave">Todavía no hay nada anotado.</p>
        ) : (
          <Tarjeta>
            {historial.map((item) => (
              <FilaHistorial key={`${item.tipo}-${item.id}`} item={item} alAnular={recargar} />
            ))}
            <div className="flex flex-col gap-1 px-4 py-3 text-suave">
              <span>
                Total viajes {pesos(totalViajes)} − pagos {pesos(totalPagos)}
                {totalPerdido > 0 ? ` − no se cobra ${pesos(totalPerdido)}` : ""}
              </span>
              <span className="text-xl font-bold text-tinta">= {pesos(totalViajes - totalPagos - totalPerdido)}</span>
            </div>
          </Tarjeta>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <Link to={`/clientes/${cliente.id}/hoja`} className="flex min-h-14 items-center justify-center rounded-[14px] border-2 border-azul bg-white font-bold text-azul">
          Cargar la hoja de papel
        </Link>
        <Link to={`/clientes/${cliente.id}/editar`} className="flex min-h-14 items-center justify-center rounded-[14px] border-2 border-azul bg-white font-bold text-azul">
          Cambiar datos del cliente
        </Link>
      </div>
    </Pantalla>
  );
}

function Recordatorio({ ficha, alEnviar }: { ficha: FichaCliente; alEnviar: () => void }) {
  const { ajustes } = useAjustes();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { cliente } = ficha;
  const telefono = telefonoWhatsApp(cliente.telefono);
  const ultimo = cliente.ultimo_recordatorio
    ? `Último recordatorio: ${fechaCorta(cliente.ultimo_recordatorio.slice(0, 10))}.`
    : "Último recordatorio: nunca.";

  async function abrirWhatsApp() {
    setError(null);
    // La ventana se abre antes del await: si no, el navegador del celular la bloquea.
    const ventana = window.open("about:blank", "_blank");
    try {
      const r = await api<{ enlace: string }>(`/clientes/${cliente.id}/recordatorio`, { metodo: "POST", cuerpo: {} });
      if (ventana) ventana.location.href = r.enlace;
      else window.location.href = r.enlace;
      setAbierto(false);
      alEnviar();
    } catch (e) {
      ventana?.close();
      setError(mensajeDeError(e));
    }
  }

  if (!telefono) {
    return <p className="m-0 text-suave">Para mandarle un recordatorio por WhatsApp, anotá su teléfono en "Cambiar datos del cliente".</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <Boton variante="secundario" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Cerrar mensaje" : "Recordar por WhatsApp"}
      </Boton>
      {abierto && ajustes && (
        <Tarjeta className="flex flex-col gap-3 p-4">
          <span className="font-bold text-suave">Mensaje que se va a mandar</span>
          <p className="m-0">
            {mensajeRecordatorio({ cliente: cliente.nombre, empresa: ajustes.nombre_empresa, debe: cliente.debe, moneda: ajustes.moneda })}
          </p>
          <Boton onClick={abrirWhatsApp}>Abrir WhatsApp</Boton>
          <span className="text-base text-suave">Se abre tu WhatsApp con el mensaje escrito. Lo mandás vos; la app no manda nada sola.</span>
        </Tarjeta>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      <span className="text-base text-suave">{ultimo}</span>
    </div>
  );
}

function FilaHistorial({ item, alAnular }: { item: ItemHistorial; alAnular: () => void }) {
  const titulo =
    item.tipo === "fiado"
      ? `Viaje · ${fechaCorta(item.fecha)}`
      : `${item.origen === "carga_inicial" ? "Pagó (hoja de papel)" : "Pagó"} · ${fechaCorta(item.fecha)}`;
  const detalle =
    item.tipo === "fiado"
      ? [item.chofer ? `Chofer ${item.chofer}` : item.nota, item.coche, item.origen === "carga_inicial" ? "de la hoja de papel" : null]
          .filter(Boolean)
          .join(" · ")
      : item.medio === "transferencia"
        ? "Transferencia"
        : item.medio === "efectivo"
          ? `Efectivo, ${item.recibido_por ? `lo recibió ${item.recibido_por}` : "lo recibiste vos"}`
          : "";

  return (
    <div className={`flex flex-col gap-1 border-b border-separador px-4 py-3 ${item.anulado ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`flex-1 font-bold ${item.anulado ? "line-through" : ""}`}>{titulo}</span>
        <span className={`font-bold whitespace-nowrap ${item.anulado ? "line-through" : ""}`}>
          {item.tipo === "cobro" ? `− ${pesos(item.importe)}` : pesos(item.importe)}
        </span>
      </div>
      {detalle && <span className="text-base text-suave">{detalle}</span>}
      {item.tipo === "fiado" && !item.anulado && item.incobrable && (
        <span className="text-base font-bold text-tinta">{item.pagado ? `Pagó ${pesos(item.pagado)}` : "No pagó nada"}</span>
      )}
      {item.tipo === "fiado" && !item.anulado && !item.incobrable && (
        <span className={`text-base font-bold ${item.pendiente === 0 ? "text-verde" : "text-tinta"}`}>
          {item.pendiente === 0 ? "Pago" : `Debe ${pesos(item.pendiente ?? 0)}`}
          {item.pagado && item.pendiente !== 0 ? ` (pagó ${pesos(item.pagado)})` : ""}
        </span>
      )}
      {item.tipo === "cobro" && !item.anulado && (item.a_favor ?? 0) > 0 && (
        <span className="text-base font-bold text-verde">{pesos(item.a_favor ?? 0)} a favor</span>
      )}
      {item.anulado && <span className="text-base font-bold text-rojo">Anulado: {item.motivo_anulacion}</span>}
      {item.tipo === "cobro" && !item.anulado && item.origen === "normal" && (
        <FotosComprobante tabla="cobro" registroId={item.id} fotos={item.comprobantes ?? []} alCambiar={alAnular} />
      )}
      {item.tipo === "fiado" && !item.anulado && item.incobrable && (
        <>
          <span className="text-base font-bold text-rojo">
            No se cobra: {pesos(item.incobrable.importe)} ({item.incobrable.motivo})
          </span>
          <AnularConMotivo
            ruta={`/fiados/incobrables/${item.incobrable.id}/anular`}
            alAnular={alAnular}
            texto="Al final pagó…"
            pregunta="¿Qué pasó?"
            confirmar="Volver a la deuda"
          />
        </>
      )}
      {item.tipo === "fiado" && !item.anulado && !item.incobrable && (item.pendiente ?? 0) > 0 && (
        <AnularConMotivo
          ruta={`/fiados/${item.id}/incobrable`}
          alAnular={alAnular}
          texto="No se va a cobrar…"
          pregunta="¿Por qué no se va a cobrar?"
          confirmar="Darlo por perdido"
        />
      )}
      {!item.anulado && <AnularConMotivo ruta={`/${item.tipo === "fiado" ? "fiados" : "cobros"}/${item.id}/anular`} alAnular={alAnular} />}
    </div>
  );
}
