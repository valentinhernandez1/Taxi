/* global self */
/* Avisos al celular (Web Push). El push llega vacío: acá se piden los avisos
   de hoy a la API con la sesión del dueño y se muestra la notificación. */
self.addEventListener("push", (evento) => {
  evento.waitUntil(
    (async () => {
      let avisos = [];
      try {
        const r = await fetch("/api/push/avisos", { credentials: "include" });
        if (r.ok) avisos = (await r.json()).avisos ?? [];
      } catch {
        // Sin conexión: igual se avisa que hay algo para mirar.
      }
      const cuerpo = avisos.length ? avisos.slice(0, 4).join("\n") : "Hay cosas para revisar en la app.";
      await self.registration.showNotification(avisos.length > 1 ? `Taxis: ${avisos.length} avisos` : "Taxis", {
        body: cuerpo,
        icon: "/icono-192.png",
        badge: "/icono-192.png",
        tag: "aviso-diario",
        lang: "es-UY",
      });
    })(),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) if ("focus" in v) return v.focus();
      return self.clients.openWindow("/");
    })(),
  );
});
