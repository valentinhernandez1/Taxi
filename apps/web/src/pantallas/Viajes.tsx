import { formatearDiaLargo, sumarDias } from "@taxis/shared";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, mensajeDeError } from "../api";
import { AnularConMotivo } from "../anular";
import { hoyUY } from "../asistente";
import { Aviso, Boton, Pantalla, Tarjeta } from "../componentes";
import { pesos, useCargar } from "../datos";
import type { DiaDeViajes, ViajeDelDia } from "../tipos";

const FLECHA = "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-azul bg-white text-3xl font-bold text-azul disabled:opacity-40";

const FORMA: Record<ViajeDelDia["forma_pago"], string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", fiado: "Fiado" };

/** Los viajes de un día, con los totales para comparar con el papel. */
export function Viajes() {
  const [params, setParams] = useSearchParams();
  const hoy = hoyUY();
  const fecha = params.get("fecha") ?? hoy;
  const { datos, error, recargar } = useCargar<DiaDeViajes>(`/viajes?fecha=${fecha}`);
  const irA = (d: string) => setParams({ fecha: d });

  return (
    <Pantalla titulo="Viajes anotados" volver="/">
      <div className="flex items-center gap-2">
        <button type="button" className={FLECHA} onClick={() => irA(sumarDias(fecha, -1))} aria-label="Día anterior">
          ‹
        </button>
        <span className="flex-1 text-center text-xl font-bold">{formatearDiaLargo(fecha)}</span>
        <button type="button" className={FLECHA} disabled={fecha >= hoy} onClick={() => irA(sumarDias(fecha, 1))} aria-label="Día siguiente">
          ›
        </button>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <>
          <Tarjeta className="flex flex-col gap-1 p-4">
            <span className="font-bold text-suave">Total del día</span>
            <span className="text-[32px] font-bold">{pesos(datos.totales.total)}</span>
            <span className="text-suave">
              Efectivo {pesos(datos.totales.efectivo)} · Tarjeta {pesos(datos.totales.tarjeta)} · Fiado {pesos(datos.totales.fiado)}
            </span>
          </Tarjeta>

          <Link to="/viaje" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
            Anotar viaje
          </Link>

          {datos.viajes.length === 0 ? (
            datos.sin_trabajo ? (
              <Aviso tipo="bien">Este día está marcado como que no se trabajó.</Aviso>
            ) : (
              <SinViajes fecha={fecha} alMarcar={recargar} />
            )
          ) : (
            <Tarjeta>
              {datos.viajes.map((v) => (
                <div key={v.id} className={`flex flex-col gap-1 border-b border-separador px-4 py-3 ${v.anulado ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex-1 font-bold ${v.anulado ? "line-through" : ""}`}>
                      {FORMA[v.forma_pago]}
                      {v.cliente ? ` · ${v.cliente}` : ""}
                    </span>
                    <span className={`font-bold whitespace-nowrap ${v.anulado ? "line-through" : ""}`}>{pesos(v.importe)}</span>
                  </div>
                  <span className="text-base text-suave">{[v.chofer ?? "Sin chofer", v.coche].filter(Boolean).join(" · ")}</span>
                  {v.anulado ? (
                    <span className="text-base font-bold text-rojo">Anulado: {v.motivo_anulacion}</span>
                  ) : (
                    <AnularConMotivo ruta={`/viajes/${v.id}/anular`} alAnular={recargar} />
                  )}
                </div>
              ))}
            </Tarjeta>
          )}
        </>
      )}
    </Pantalla>
  );
}

/** Un día sin nada anotado: o falta cargarlo, o no se trabajó (regla 9). */
export function SinViajes({ fecha, alMarcar }: { fecha: string; alMarcar: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function marcar() {
    setGuardando(true);
    setError(null);
    try {
      await api("/viajes/sin-trabajo", { metodo: "POST", cuerpo: { fecha } });
      alMarcar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Aviso tipo="atencion">No hay viajes anotados este día. Mientras falten días, los totales dicen “incompleto”.</Aviso>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton variante="secundario" disabled={guardando} onClick={marcar}>
        Ese día no se trabajó
      </Boton>
    </div>
  );
}
