import type { NivelAlerta } from "@taxis/shared";
import { useState } from "react";
import { Link } from "react-router";
import { Buscador } from "../asistente";
import { Aviso, Pantalla, Tarjeta } from "../componentes";
import { haceDias, pesos, useCargar } from "../datos";
import type { ResumenCliente } from "../tipos";

export const COLOR_NIVEL: Record<NivelAlerta, string> = {
  roja: "text-rojo",
  amarilla: "text-amarillo-texto",
  normal: "text-tinta",
  sin_deuda: "text-verde",
};

export function QuienDebe() {
  const [buscar, setBuscar] = useState("");
  const ruta = buscar.trim() ? `/clientes?buscar=${encodeURIComponent(buscar.trim())}` : "/clientes?deben=1";
  const { datos, error } = useCargar<{ clientes: ResumenCliente[]; total_debe: number }>(ruta);
  const deudores = useCargar<{ clientes: ResumenCliente[]; total_debe: number }>("/clientes?deben=1").datos;

  const cuenta = (nivel: NivelAlerta) => deudores?.clientes.filter((c) => c.nivel === nivel).length ?? 0;

  return (
    <Pantalla titulo="Quién debe">
      <Buscador valor={buscar} onCambio={setBuscar} etiqueta="Buscar cliente" />
      {deudores && !buscar && (
        <Tarjeta className="flex flex-col gap-2 p-4">
          <span className="font-bold text-suave">Te deben en total</span>
          <span className="text-[32px] font-bold">{pesos(deudores.total_debe)}</span>
          <div className="flex flex-wrap gap-2 text-base font-bold">
            <span className="rounded-full bg-rojo-fondo px-3 py-1 text-rojo">En rojo: {cuenta("roja")}</span>
            <span className="rounded-full bg-amarillo-fondo px-3 py-1 text-amarillo-texto">En amarillo: {cuenta("amarilla")}</span>
            <span className="rounded-full bg-fondo px-3 py-1 text-suave">Al día: {cuenta("normal")}</span>
          </div>
        </Tarjeta>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos && datos.clientes.length === 0 && (
        <p className="m-0 text-suave">{buscar ? "No hay clientes con ese nombre." : "Nadie debe nada. ¡Bien!"}</p>
      )}
      {datos && datos.clientes.length > 0 && (
        <Tarjeta>
          {datos.clientes.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="flex min-h-16 items-center gap-3 border-b border-separador px-4 py-3 last:border-b-0">
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{c.nombre}</span>
                <span className="text-base text-suave">
                  {c.antiguedad_dias !== null ? `Lo más viejo: ${haceDias(c.antiguedad_dias)}` : c.a_favor > 0 ? `Tiene ${pesos(c.a_favor)} a favor` : "No debe nada"}
                </span>
              </span>
              <span className={`text-xl font-bold ${COLOR_NIVEL[c.nivel]}`}>{c.debe > 0 ? pesos(c.debe) : ""}</span>
            </Link>
          ))}
        </Tarjeta>
      )}
      <div className="flex flex-col gap-3">
        <Link to="/cobro" className="flex min-h-16 items-center justify-center rounded-[14px] bg-azul text-xl font-bold text-white">
          Anotar un cobro
        </Link>
        <Link to="/clientes/nuevo" className="flex min-h-14 items-center justify-center rounded-[14px] border-2 border-azul bg-white font-bold text-azul">
          Cliente nuevo
        </Link>
      </div>
    </Pantalla>
  );
}
