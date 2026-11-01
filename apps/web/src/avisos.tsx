import { useEffect, useState } from "react";
import { api, mensajeDeError } from "./api";
import { Aviso, Boton, Tarjeta } from "./componentes";

function aBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type Estado = "cargando" | "no-configurado" | "no-soportado" | "bloqueado" | "apagado" | "activado";

/** Activar los avisos al celular (Web Push) en este teléfono. */
export function AvisosCelular() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [clave, setClave] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ clave: string | null }>("/push/clave");
        if (!r.clave) return setEstado("no-configurado");
        setClave(r.clave);
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("no-soportado");
        if (Notification.permission === "denied") return setEstado("bloqueado");
        const registro = await navigator.serviceWorker.ready;
        setEstado((await registro.pushManager.getSubscription()) ? "activado" : "apagado");
      } catch (e) {
        setError(mensajeDeError(e));
      }
    })();
  }, []);

  async function activar() {
    if (!clave) return;
    setOcupado(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return setEstado(permiso === "denied" ? "bloqueado" : "apagado");
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) });
      await api("/push/suscribir", { metodo: "POST", cuerpo: sub.toJSON() });
      setEstado("activado");
      setMensaje("Listo: los avisos te van a llegar a este celular a las 8 de la mañana, cuando haya algo.");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    setOcupado(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (sub) {
        await api("/push/desuscribir", { metodo: "POST", cuerpo: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setEstado("apagado");
      setMensaje(null);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    setError(null);
    try {
      const r = await api<{ enviados: number }>("/push/probar", { metodo: "POST", cuerpo: {} });
      setMensaje(r.enviados ? "Mandado. Te tiene que llegar en unos segundos." : "No hay ningún celular con los avisos activados.");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <span className="text-xl font-bold">Avisos en el celular</span>
      <span className="text-base text-suave">
        Vencimientos, días sin cargar, plata sin entregar y deudas viejas, una vez por día. En iPhone, primero agregá la app a la pantalla de
        inicio (Compartir → Agregar a inicio).
      </span>
      {estado === "cargando" && <span className="text-suave">Revisando…</span>}
      {estado === "no-configurado" && <Aviso tipo="atencion">Todavía no están configurados. Pedile a Valentín que cargue las claves.</Aviso>}
      {estado === "no-soportado" && <Aviso tipo="atencion">Este navegador no admite avisos. En iPhone, abrí la app desde el ícono de la pantalla de inicio.</Aviso>}
      {estado === "bloqueado" && <Aviso tipo="atencion">Los avisos están bloqueados para esta app. Habilitalos en los ajustes del celular.</Aviso>}
      {estado === "apagado" && (
        <Boton disabled={ocupado} onClick={activar}>
          Activar los avisos
        </Boton>
      )}
      {estado === "activado" && (
        <>
          <Aviso tipo="bien">Activados en este celular.</Aviso>
          <Boton variante="secundario" disabled={ocupado} onClick={probar}>
            Mandar un aviso de prueba
          </Boton>
          <Boton variante="peligro" disabled={ocupado} onClick={apagar}>
            Apagar los avisos
          </Boton>
        </>
      )}
      {mensaje && <Aviso tipo="bien">{mensaje}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </Tarjeta>
  );
}
