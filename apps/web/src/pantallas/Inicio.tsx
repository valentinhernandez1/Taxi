import { diaEnUruguay, formatearDiaLargo, sumarDias } from "@taxis/shared";
import { Link } from "react-router";
import { useAjustes } from "../ajustes";
import { Aviso, ICONOS, Icono, Tarjeta } from "../componentes";
import { cuandoVence, pesos, useCargar } from "../datos";
import type { Cobertura, ResumenCliente, ResumenPlata, Vencimiento } from "../tipos";

function BotonInicio({ a, icono, texto, principal }: { a: string; icono: string; texto: string; principal?: boolean }) {
  return (
    <Link
      to={a}
      className={`flex min-h-16 items-center gap-3.5 rounded-[14px] px-5 text-xl font-bold ${
        principal ? "bg-azul text-white" : "border-2 border-azul bg-white text-azul"
      }`}
    >
      <Icono d={icono} className="h-7 w-7" />
      {texto}
    </Link>
  );
}

export function Inicio() {
  const { ajustes } = useAjustes();
  const { datos: deben } = useCargar<{ clientes: ResumenCliente[]; total_debe: number }>("/clientes?deben=1");
  const hoy = diaEnUruguay(new Date());
  // Avisa de la última semana sin contar hoy (el día todavía no terminó).
  const { datos: dias } = useCargar<Cobertura>(`/viajes/dias?desde=${sumarDias(hoy, -7)}&hasta=${sumarDias(hoy, -1)}&desde_el_primero=1`);
  const { datos: plata } = useCargar<ResumenPlata>("/plata");
  const faltan = dias?.diasSinCargar ?? [];
  const { datos: venc } = useCargar<{ vencimientos: Vencimiento[] }>("/vencimientos");
  const avisos = venc?.vencimientos.filter((v) => v.avisar) ?? [];
  const enRojo = deben?.clientes.filter((c) => c.nivel === "roja").length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-5 pb-28">
      <div className="flex flex-col gap-0.5">
        <div className="text-base text-suave">{formatearDiaLargo(diaEnUruguay(new Date()))}</div>
        <h1 className="m-0 text-[28px] font-bold">Hola</h1>
        {ajustes && <div className="text-suave">{ajustes.nombre_empresa}</div>}
      </div>

      <div className="flex flex-col gap-2.5">
        <BotonInicio a="/viaje" icono={ICONOS.auto} texto="Anotar viaje" principal />
        <BotonInicio a="/cobro" icono={ICONOS.plata} texto="Anotar cobro" principal />
        <BotonInicio a="/fiado" icono={ICONOS.auto} texto="Anotar fiado" />
        <BotonInicio a="/gasto" icono={ICONOS.recibo} texto="Anotar gasto" />
      </div>

      {deben && (
        <Tarjeta>
          <Link to="/deben" className="flex flex-col gap-1 p-4">
            <span className="flex items-center justify-between">
              <span className="text-base font-bold text-suave">Te deben</span>
              <span className="text-base font-bold text-azul">Ver ›</span>
            </span>
            <span className="text-[32px] font-bold">{pesos(deben.total_debe)}</span>
            <span className="text-suave">
              {deben.clientes.length === 0
                ? "Nadie debe nada."
                : `${deben.clientes.length} ${deben.clientes.length === 1 ? "cliente" : "clientes"}${enRojo ? `, ${enRojo} en rojo` : ""}.`}
            </span>
          </Link>
        </Tarjeta>
      )}

      {avisos.length > 0 && (
        <Link to="/vencimientos">
          <Aviso tipo={avisos.some((v) => v.vencido) ? "error" : "atencion"}>
            {avisos.length === 1
              ? `${avisos[0]!.descripcion}: ${cuandoVence(avisos[0]!.dias).toLowerCase()}.`
              : `${avisos.length} cosas para pagar${avisos.some((v) => v.vencido) ? ", alguna ya vencida" : ""}.`}{" "}
            Tocá para verlas.
          </Aviso>
        </Link>
      )}

      {faltan.length > 0 && (
        <Link to={`/mas/viajes?fecha=${faltan[faltan.length - 1]}`}>
          <Aviso tipo="atencion">
            {faltan.length === 1
              ? `Falta anotar el ${formatearDiaLargo(faltan[0]!).toLowerCase()}.`
              : `Faltan anotar ${faltan.length} días de la última semana.`}{" "}
            Tocá para cargarlo o marcar que no se trabajó.
          </Aviso>
        </Link>
      )}

      {plata && (
        <Tarjeta>
          <Link to="/plata" className="flex flex-col gap-1 p-4">
            <span className="flex items-center justify-between">
              <span className="text-base font-bold text-suave">Te tienen que entregar</span>
              <span className="text-base font-bold text-azul">Ver ›</span>
            </span>
            <span className="text-[32px] font-bold">{pesos(plata.a_entregar)}</span>
            <span className="text-suave">
              En tu caja {pesos(plata.caja)} · Handy por acreditar {pesos(plata.handy)}
            </span>
          </Link>
        </Tarjeta>
      )}
    </main>
  );
}
