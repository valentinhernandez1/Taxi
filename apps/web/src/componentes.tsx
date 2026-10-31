import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, NavLink } from "react-router";

/** Botones de al menos 48 px; el principal va abajo y a lo ancho. */
export function Boton({
  variante = "principal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "secundario" | "peligro" }) {
  const estilos = {
    principal: "bg-azul text-white hover:bg-azul-oscuro",
    secundario: "bg-white text-azul border-2 border-azul",
    peligro: "bg-white text-rojo border-2 border-rojo",
  }[variante];
  return (
    <button
      className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-[14px] px-5 text-xl font-bold disabled:opacity-60 ${estilos} ${className}`}
      {...props}
    />
  );
}

export function Pantalla({ titulo, volver, children }: { titulo: string; volver?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-5 pb-28">
      {volver && (
        <Link to={volver} className="flex min-h-12 items-center gap-1 self-start font-bold text-azul">
          <Icono d="M15 6l-6 6 6 6" /> Volver
        </Link>
      )}
      <h1 className="m-0 text-[28px] leading-tight font-bold">{titulo}</h1>
      {children}
    </main>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[14px] border border-borde bg-white ${className}`}>{children}</div>;
}

export function Aviso({ tipo, children }: { tipo: "error" | "atencion" | "bien"; children: ReactNode }) {
  const estilos = {
    error: "bg-rojo-fondo border-rojo text-rojo",
    atencion: "bg-amarillo-fondo border-amarillo-borde text-amarillo-texto",
    bien: "bg-white border-verde text-verde",
  }[tipo];
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`rounded-[14px] border px-4 py-3 font-bold ${estilos}`}>
      {children}
    </div>
  );
}

export function Icono({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={d} />
    </svg>
  );
}

export const ICONOS = {
  inicio: "M3 11l9-8 9 8v10H5V11",
  deben: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  plata: "M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  ganancia: "M3 17l6-6 4 4 8-8M15 7h6v6",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4",
  llave: "M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7z",
  salir: "M10 17l-5-5 5-5M5 12h12M14 4h5v16h-5",
  flecha: "M9 6l6 6-6 6",
  auto: "M4 16h16v-4l-2-5H6l-2 5zM8 17a2 2 0 1 0 0 .01M16 17a2 2 0 1 0 0 .01",
  personas: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5",
} as const;

const PESTANAS = [
  { a: "/", texto: "Inicio", icono: ICONOS.inicio },
  { a: "/deben", texto: "Deben", icono: ICONOS.deben },
  { a: "/plata", texto: "Plata", icono: ICONOS.plata },
  { a: "/ganancia", texto: "Ganancia", icono: ICONOS.ganancia },
  { a: "/mas", texto: "Más", icono: ICONOS.mas },
];

export function BarraInferior() {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 border-t border-borde bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {PESTANAS.map((p) => (
          <li key={p.a} className="flex-1">
            <NavLink
              to={p.a}
              end={p.a === "/"}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[15px] font-bold ${
                  isActive ? "text-azul" : "text-suave"
                }`
              }
            >
              <Icono d={p.icono} />
              {p.texto}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FilaMenu({ a, icono, texto, onClick }: { a?: string; icono: string; texto: string; onClick?: () => void }) {
  const contenido = (
    <>
      <span className="text-azul">
        <Icono d={icono} />
      </span>
      <span className="flex-1 text-left font-bold">{texto}</span>
      <span className="text-suave">
        <Icono d={ICONOS.flecha} className="h-[22px] w-[22px]" />
      </span>
    </>
  );
  const clases = "flex min-h-16 w-full items-center gap-3.5 border-b border-separador px-4 last:border-b-0";
  return a ? (
    <Link to={a} className={clases}>
      {contenido}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={clases}>
      {contenido}
    </button>
  );
}
