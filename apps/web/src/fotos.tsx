/**
 * Fotos de comprobantes. La foto se achica en el celular antes de subirla
 * (1.600 px como máximo, JPEG): sube rápido con datos móviles y gasta poco.
 */
import { useRef, useState } from "react";
import { api, ErrorApi, mensajeDeError } from "./api";
import { Aviso, Boton } from "./componentes";
import { nuevaOpKey } from "./datos";

const LADO_MAXIMO = 1600;

/** Dibuja la foto en un canvas más chico. El navegador ya la endereza según la cámara. */
export async function achicarFoto(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.naturalWidth, imagen.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imagen.naturalWidth * escala);
    canvas.height = Math.round(imagen.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(imagen, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((listo) => canvas.toBlob(listo, "image/jpeg", 0.8));
    if (!blob) throw new Error("No se pudo preparar la foto");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function subirFoto(tabla: "cobro" | "gasto", registroId: number, foto: Blob, opKey: string): Promise<void> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api/comprobantes/${tabla}/${registroId}?op_key=${encodeURIComponent(opKey)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": foto.type || "image/jpeg" },
      body: foto,
    });
  } catch {
    throw new ErrorApi("No hay conexión. Revisá internet y probá de nuevo.", 0);
  }
  if (!respuesta.ok) {
    const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
    throw new ErrorApi(datos.error ?? "No se pudo subir la foto.", respuesta.status);
  }
}

export interface FotoGuardada {
  id: number;
  miniatura: boolean;
}

/** Miniaturas de las fotos de un registro, botón para agregar y visor a pantalla completa. */
export function FotosComprobante({
  tabla,
  registroId,
  fotos,
  alCambiar,
  textoBoton = "Agregar foto del comprobante",
}: {
  tabla: "cobro" | "gasto";
  registroId: number;
  fotos: FotoGuardada[];
  alCambiar: () => void;
  textoBoton?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"quieto" | "subiendo">("quieto");
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  // Se reusa si hay que reintentar la misma foto (regla 8: un doble envío no duplica).
  const opKey = useRef(nuevaOpKey());

  async function elegida(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setEstado("subiendo");
    try {
      const foto = await achicarFoto(archivo);
      await subirFoto(tabla, registroId, foto, opKey.current);
      opKey.current = nuevaOpKey();
      alCambiar();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEstado("quieto");
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAbierta(f.id)}
              className="h-20 w-20 overflow-hidden rounded-xl border border-borde bg-white"
              aria-label="Ver la foto del comprobante"
            >
              <img src={`/api/comprobantes/${f.id}/miniatura`} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void elegida(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={estado === "subiendo"}
        onClick={() => entrada.current?.click()}
        className="min-h-12 self-start text-base font-bold text-azul disabled:opacity-60"
      >
        {estado === "subiendo" ? "Subiendo la foto…" : fotos.length ? "Agregar otra foto" : textoBoton}
      </button>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {abierta !== null && <Visor id={abierta} alCerrar={() => setAbierta(null)} alAnular={alCambiar} />}
    </div>
  );
}

function Visor({ id, alCerrar, alAnular }: { id: number; alCerrar: () => void; alAnular: () => void }) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function anular() {
    setError(null);
    try {
      await api(`/comprobantes/${id}/anular`, { metodo: "POST", cuerpo: { motivo } });
      alCerrar();
      alAnular();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto del comprobante" className="fixed inset-0 z-50 flex flex-col gap-3 bg-tinta/95 p-4">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <img src={`/api/comprobantes/${id}/foto`} alt="Foto del comprobante" className="max-h-full max-w-full rounded-lg" />
      </div>
      {anulando ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-white p-3">
          <label className="flex flex-col gap-1 font-bold">
            ¿Por qué sacás esta foto?
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
              placeholder="Por ejemplo: foto equivocada"
              className="min-h-14 rounded-xl border-2 border-borde px-3 text-lg font-normal"
            />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton variante="peligro" disabled={motivo.trim().length < 3} onClick={anular}>
            Sacar la foto
          </Boton>
        </div>
      ) : (
        <button type="button" onClick={() => setAnulando(true)} className="min-h-12 font-bold text-white underline">
          Esta foto está mal
        </button>
      )}
      <Boton variante="secundario" onClick={alCerrar}>
        Cerrar
      </Boton>
    </div>
  );
}
