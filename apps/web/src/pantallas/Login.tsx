import { useState, type FormEvent } from "react";
import { mensajeDeError } from "../api";
import { Aviso, Boton } from "../componentes";
import { useSesion } from "../sesion";

export function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(email, password);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  const campo = "min-h-14 w-full rounded-xl border-2 border-borde bg-white px-4 text-xl";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">Entrar</h1>
        <p className="m-0 text-suave">Con el email y la contraseña del dueño.</p>
      </div>
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2 font-bold">
          Email
          <input
            className={campo}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Contraseña
          <input
            className={campo}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Boton>
      </form>
    </main>
  );
}
