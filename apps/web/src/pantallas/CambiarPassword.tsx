import { esquemaPasswordNueva } from "@taxis/shared";
import { useState, type FormEvent } from "react";
import { api, mensajeDeError } from "../api";
import { Aviso, Boton, Pantalla } from "../componentes";

export function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    const valida = esquemaPasswordNueva.safeParse(nueva);
    if (!valida.success) return setError(valida.error.issues[0]?.message ?? "Contraseña inválida");
    if (nueva !== repetida) return setError("Las dos contraseñas nuevas no son iguales");
    setGuardando(true);
    try {
      await api("/auth/password", { metodo: "POST", cuerpo: { actual, nueva } });
      setListo(true);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (listo) {
    return (
      <Pantalla titulo="Cambiar contraseña" volver="/mas">
        <Aviso tipo="bien">Listo. La contraseña nueva ya funciona y se cerró la sesión en los otros aparatos.</Aviso>
      </Pantalla>
    );
  }

  const campo = "min-h-14 w-full rounded-xl border-2 border-borde bg-white px-4 text-xl";
  return (
    <Pantalla titulo="Cambiar contraseña" volver="/mas">
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 font-bold">
          Contraseña de ahora
          <input className={campo} type="password" autoComplete="current-password" required value={actual} onChange={(e) => setActual(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Contraseña nueva
          <span className="font-normal text-suave">Al menos 12 letras. Una frase es fácil de recordar.</span>
          <input className={campo} type="password" autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Repetila
          <input className={campo} type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </form>
    </Pantalla>
  );
}
