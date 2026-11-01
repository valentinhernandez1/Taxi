import { useState } from "react";
import { api, mensajeDeError } from "./api";
import { Aviso, Boton } from "./componentes";

/** "Anular…" con motivo obligatorio: nada confirmado se borra (regla 6). */
export function AnularConMotivo({
  ruta,
  alAnular,
  texto = "Anular…",
  pregunta = "¿Por qué lo anulás?",
  confirmar = "Anular",
}: {
  ruta: string;
  alAnular: () => void;
  texto?: string;
  pregunta?: string;
  confirmar?: string;
}) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function anular() {
    setError(null);
    setGuardando(true);
    try {
      await api(ruta, { metodo: "POST", cuerpo: { motivo } });
      setAnulando(false);
      alAnular();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!anulando) {
    return (
      <button type="button" onClick={() => setAnulando(true)} className="min-h-12 self-start text-base font-bold text-azul">
        {texto}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      <label className="flex flex-col gap-1 font-bold">
        {pregunta}
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          autoFocus
          className="min-h-14 rounded-xl border-2 border-borde px-3 text-lg font-normal"
          placeholder="Por ejemplo: se anotó dos veces"
        />
      </label>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex gap-2">
        <Boton variante="peligro" disabled={guardando || motivo.trim().length < 3} onClick={anular} className="min-h-14 text-lg">
          {confirmar}
        </Boton>
        <Boton variante="secundario" onClick={() => setAnulando(false)} className="min-h-14 text-lg">
          No
        </Boton>
      </div>
    </div>
  );
}
