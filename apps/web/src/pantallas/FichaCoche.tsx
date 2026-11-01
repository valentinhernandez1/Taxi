import { Link, useParams, useSearchParams } from "react-router";
import { hoyUY } from "../asistente";
import { Aviso, Pantalla, Tarjeta } from "../componentes";
import { cuandoVence, fechaCorta, mesLargo, pesos, useCargar } from "../datos";
import type { FichaCoche as Datos } from "../tipos";
import { AvisoIncompleto, ElegirMes } from "./Gastos";

function Fila({ texto, importe, fuerte, signo = "" }: { texto: string; importe: number; fuerte?: boolean; signo?: string }) {
  return (
    <div className={`flex min-h-12 items-center justify-between border-b border-separador px-4 last:border-b-0 ${fuerte ? "font-bold" : ""}`}>
      <span>{texto}</span>
      <span className="whitespace-nowrap">
        {signo}
        {pesos(importe)}
      </span>
    </div>
  );
}

/** Resultado por coche: facturado − gastos de funcionamiento; la cuota abajo, aparte (regla 11). */
export function FichaCoche() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") ?? hoyUY().slice(0, 7);
  const { datos, error } = useCargar<Datos>(`/ficha-coche/${id}?mes=${mes}`);

  return (
    <Pantalla titulo={datos?.coche.nombre_movil ?? "Coche"} volver="/mas/coches">
      {datos?.coche.matricula && <p className="m-0 -mt-3 text-suave">Matrícula {datos.coche.matricula}</p>}
      <ElegirMes mes={mes} onCambio={(m) => setParams({ mes: m })} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && (
        <>
          <AvisoIncompleto faltan={datos.cobertura.diasSinCargar} />
          <Tarjeta className="flex flex-col gap-1 p-4">
            <span className="font-bold text-suave">Facturado en {mesLargo(mes).toLowerCase()}</span>
            <span className="text-[32px] font-bold">{pesos(datos.facturado)}</span>
            <span className="text-suave">{datos.viajes === 1 ? "1 viaje anotado" : `${datos.viajes} viajes anotados`}</span>
          </Tarjeta>

          <Tarjeta>
            <div className="px-4 pt-3 font-bold text-suave">Gastos de funcionamiento</div>
            {datos.funcionamiento.length === 0 ? (
              <p className="m-0 px-4 py-3 text-suave">No hay gastos de este coche en el mes.</p>
            ) : (
              datos.funcionamiento.map((g) => <Fila key={g.categoria} texto={g.categoria} importe={g.total} signo="− " />)
            )}
          </Tarjeta>

          <Tarjeta>
            <Fila texto="Resultado antes de cuota" importe={datos.resultado_antes_de_cuota} fuerte />
            <p className="m-0 px-4 py-2 text-base text-suave">
              Todavía sin la parte de los choferes: se va a descontar cuando estén las liquidaciones.
            </p>
          </Tarjeta>

          <Tarjeta>
            <div className="px-4 pt-3 font-bold text-suave">Cuota del coche · separada de los gastos</div>
            <Fila texto={`Cuota de ${mesLargo(mes).toLowerCase()}`} importe={datos.cuotas} signo="− " />
            <Fila texto="Resultado después de cuota" importe={datos.resultado_despues_de_cuota} fuerte />
            {datos.cuotas_restantes != null && (
              <p className="m-0 px-4 py-2 text-base text-suave">
                {datos.cuotas_restantes === 0 ? "No quedan cuotas." : `Quedan ${datos.cuotas_restantes} cuotas.`}
              </p>
            )}
          </Tarjeta>

          {datos.proximos_vencimientos.length > 0 && (
            <>
              <h2 className="m-0 text-xl font-bold">Próximos vencimientos</h2>
              <Tarjeta>
                {datos.proximos_vencimientos.map((v) => (
                  <Link key={v.id} to="/vencimientos" className="flex min-h-14 items-center justify-between border-b border-separador px-4 last:border-b-0">
                    <span className="flex flex-col">
                      <span className="font-bold">{v.descripcion}</span>
                      <span className="text-base text-suave">{fechaCorta(v.fecha_vence)}</span>
                    </span>
                    <span className={`font-bold ${v.vencido ? "text-rojo" : "text-suave"}`}>{cuandoVence(v.dias)}</span>
                  </Link>
                ))}
              </Tarjeta>
            </>
          )}
        </>
      )}
    </Pantalla>
  );
}
