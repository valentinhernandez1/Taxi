import { diaEnUruguay, formatearDiaLargo } from "@taxis/shared";
import { Link } from "react-router";
import { useAjustes } from "../ajustes";
import { ICONOS, Icono, Tarjeta } from "../componentes";
import { pesos, useCargar } from "../datos";
import type { ResumenCliente } from "../tipos";

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
  const enRojo = deben?.clientes.filter((c) => c.nivel === "roja").length ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-5 pb-28">
      <div className="flex flex-col gap-0.5">
        <div className="text-base text-suave">{formatearDiaLargo(diaEnUruguay(new Date()))}</div>
        <h1 className="m-0 text-[28px] font-bold">Hola</h1>
        {ajustes && <div className="text-suave">{ajustes.nombre_empresa}</div>}
      </div>

      <div className="flex flex-col gap-2.5">
        <BotonInicio a="/cobro" icono={ICONOS.plata} texto="Anotar cobro" principal />
        <BotonInicio a="/fiado" icono={ICONOS.auto} texto="Anotar fiado" principal />
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

      <p className="m-0 text-base text-suave">Viajes en efectivo y tarjeta, gastos y liquidaciones llegan en las próximas etapas.</p>
    </main>
  );
}
