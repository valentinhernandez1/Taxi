import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ErrorApi } from "./api";

export interface Usuario {
  id: number;
  email: string;
  rol: "dueno" | "telefonista" | "chofer";
}

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api<{ usuario: Usuario }>("/auth/yo")
      .then((r) => setUsuario(r.usuario))
      .catch((e: unknown) => {
        if (!(e instanceof ErrorApi && e.estado === 401)) console.error(e);
      })
      .finally(() => setCargando(false));
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    const r = await api<{ usuario: Usuario }>("/auth/login", { metodo: "POST", cuerpo: { email, password } });
    setUsuario(r.usuario);
  }, []);

  const salir = useCallback(async () => {
    await api("/auth/logout", { metodo: "POST", cuerpo: {} }).catch(() => {});
    setUsuario(null);
  }, []);

  const valor = useMemo(() => ({ usuario, cargando, entrar, salir }), [usuario, cargando, entrar, salir]);
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): Sesion {
  const sesion = useContext(ContextoSesion);
  if (!sesion) throw new Error("useSesion fuera de ProveedorSesion");
  return sesion;
}
