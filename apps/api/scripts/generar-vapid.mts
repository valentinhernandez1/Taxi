/**
 * Genera las claves VAPID para los avisos al celular (Web Push).
 *   pnpm --filter @taxis/api vapid:generar
 * Imprime VAPID_PUBLICA y VAPID_PRIVADA para cargarlas como secrets de GitHub
 * (ver docs/despliegue.md). La privada no se guarda en ningún archivo.
 */
import { webcrypto } from "node:crypto";

const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

const par = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publica = await webcrypto.subtle.exportKey("raw", par.publicKey);
const privada = await webcrypto.subtle.exportKey("jwk", par.privateKey);

console.log("Cargá estos dos como secrets del repo en GitHub (Settings → Secrets and variables → Actions):\n");
console.log(`VAPID_PUBLICA=${b64u(publica)}`);
console.log(`VAPID_PRIVADA=${privada.d}`);
console.log("\nY un tercero, VAPID_CONTACTO, con tu email así: mailto:tu-email@ejemplo.com");
