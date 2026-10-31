/** Cliente mínimo de la API: mismo origen, cookie de sesión, errores con mensaje para el dueño. */

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? "GET",
      credentials: "same-origin",
      headers: opciones.cuerpo === undefined ? {} : { "content-type": "application/json" },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    throw new ErrorApi("No hay conexión. Revisá internet y probá de nuevo.", 0);
  }
  const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
  if (!respuesta.ok) {
    throw new ErrorApi(datos.error ?? "Algo salió mal. Probá de nuevo en un rato.", respuesta.status);
  }
  return datos as T;
}

export function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : "Algo salió mal. Probá de nuevo en un rato.";
}
