import { diaEnUruguay, formatearDiaLargo } from "@taxis/shared";
import { Link } from "react-router";
import { useAjustes } from "../ajustes";
import { Aviso, ICONOS, Icono, Tarjeta } from "../componentes";

export function Inicio() {
  const { ajustes } = useAjustes();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-5 pb-28">
      <div className="flex flex-col gap-0.5">
        <div className="text-base text-suave">{formatearDiaLargo(diaEnUruguay(new Date()))}</div>
        <h1 className="m-0 text-[28px] font-bold">Hola</h1>
        {ajustes && <div className="text-suave">{ajustes.nombre_empresa}</div>}
      </div>
      <Aviso tipo="atencion">
        La app se está armando. Por ahora podés entrar y revisar los ajustes; anotar viajes, cobros y
        gastos llega en las próximas etapas.
      </Aviso>
      <Tarjeta>
        <Link to="/mas/ajustes" className="flex min-h-16 items-center gap-3.5 px-4 font-bold">
          <span className="text-azul">
            <Icono d={ICONOS.ajustes} />
          </span>
          <span className="flex-1">Ajustes</span>
          <span className="text-suave">
            <Icono d={ICONOS.flecha} />
          </span>
        </Link>
      </Tarjeta>
    </main>
  );
}
