import type { ValoresAjustes } from "@taxis/shared";
import { useEffect, useState } from "react";
import { api, mensajeDeError } from "./api";

export function useAjustes() {
  const [ajustes, setAjustes] = useState<ValoresAjustes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    api<{ ajustes: ValoresAjustes }>("/ajustes")
      .then((r) => vigente && setAjustes(r.ajustes))
      .catch((e: unknown) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, []);

  return { ajustes, error };
}
