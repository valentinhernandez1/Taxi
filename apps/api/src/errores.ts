/** Error con un mensaje para mostrarle al dueño tal cual. */
export class ErrorNegocio extends Error {
  constructor(
    mensaje: string,
    readonly estado: 400 | 401 | 403 | 404 | 409 | 429 = 400,
    /** Datos extra para la pantalla (por ejemplo, qué hay que confirmar). */
    readonly datos?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

/**
 * Hace falta que el dueño confirme algo antes de guardar (pasar el límite de
 * fiado, dejar saldo a favor). La pantalla muestra el mensaje y reintenta con
 * la confirmación.
 */
export function pedirConfirmacion(confirmar: string, mensaje: string, datos: Record<string, unknown> = {}): ErrorNegocio {
  return new ErrorNegocio(mensaje, 409, { confirmar, ...datos });
}
