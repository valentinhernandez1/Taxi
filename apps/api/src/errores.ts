/** Error con un mensaje para mostrarle al dueño tal cual. */
export class ErrorNegocio extends Error {
  constructor(
    mensaje: string,
    readonly estado: 400 | 401 | 403 | 404 | 409 | 429 = 400,
  ) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}
