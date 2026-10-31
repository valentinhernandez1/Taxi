# App de gestión — empresa de taxis familiar (San Carlos, Maldonado, Uruguay)

Leé este archivo entero antes de tocar código. La especificación completa está en `docs/especificacion.md` y el prototipo visual en `prototipo/`.

## Contexto

- Empresa chica: 2 coches, ~4 choferes, 1 telefonista. El dueño (padre de Valentín) es el **único usuario** de la app.
- En la base se sigue anotando todo en papel; el dueño carga los papeles en la app desde el celular.
- El dueño usa WhatsApp y poco más: la interfaz tiene que ser **guiada, una pregunta por pantalla**, letra grande, palabras de todos los días (nada de jerga contable).
- Prioridad: control financiero (fiados, cobros, dónde está la plata, gastos, liquidaciones, ganancia). Turnos en versión básica.
- Valentín es estudiante de Ingeniería en Computación y desarrollador; hablale en español rioplatense informal, directo y en listas numeradas.

## Reglas financieras que NUNCA se rompen

1. Un fiado no es plata cobrada. Facturación, cobrado y ganancia son tres números distintos.
2. Un pago parcial baja el saldo pero no cambia el importe original del viaje.
3. Cobrar un fiado viejo no vuelve a sumar facturación.
4. Los pagos de un cliente se imputan automáticamente a las deudas más viejas primero (FIFO).
5. Ningún saldo se escribe a mano: todo se calcula desde los registros (tabla `movimiento`).
6. Nada confirmado se borra: se anula con motivo, y queda en `auditoria`.
7. Dinero en `NUMERIC(12,2)` en la base y enteros de centésimos en el código. Nunca `float`.
8. Cada operación lleva `op_key` único para que un doble envío no duplique.
9. Si faltan datos (días sin cargar), los totales dicen "incompleto"; no se inventa nada.
10. Fechas en `America/Montevideo`. Moneda configurable, UYU por defecto, formato `$ 1.250,00`.
11. Las cuotas de compra de un coche van aparte de los gastos de funcionamiento.
12. Las reglas de liquidación de cada chofer son configurables y se marcan "sin confirmar" hasta que el dueño las confirme.

## Stack

- Monorepo TypeScript (pnpm workspaces): `apps/web` (React + Vite + Tailwind, PWA), `apps/api` (**Hono** sobre Cloudflare Workers), `packages/shared` (esquemas Zod y reglas de dinero como funciones puras).
- PostgreSQL en **Neon** + Drizzle ORM con **postgres.js por TCP** (decidido en la Etapa 2: mismo driver en local y en Neon, sin proxy; se cambia solo en `apps/api/src/db/cliente.ts`). SQL explícito para vistas de saldos. En desarrollo, Postgres local con Docker Compose.
- Auth: sesión en cookie httpOnly, segura y SameSite; hash de contraseña con WebCrypto (PBKDF2) o el que entre en el límite de CPU de Workers; límite de intentos.
- Pruebas: Vitest (reglas y API, con `@cloudflare/vitest-plugin` para la API) y Playwright (flujos en viewport de celular).
- Infraestructura (todo en planes gratuitos, detalle en `docs/infraestructura.md` y `docs/despliegue.md`): un Cloudflare Worker que sirve la web (archivos estáticos) y la API, Neon (base), GitHub Actions (copias diarias cifradas con `pg_dump` y CI), Web Push para avisos.
- Restricciones a respetar: Workers gratis = 10 ms de CPU por pedido y 100.000 pedidos/día; sin APIs de Node que Workers no soporte; Neon gratis = 1 GB, se suspende a los 5 min sin uso y guarda solo 6 h de historial (por eso las copias propias son obligatorias).
- Todo con PostgreSQL estándar, sin depender de funciones propietarias, para poder mudarse de proveedor sin reescribir.
- No agregar servicios pagos sin explicar costo y pedir aprobación.

## Forma de trabajo

1. Un módulo por vez, según el plan por etapas de `docs/especificacion.md`.
2. Explicá los archivos y las decisiones importantes al terminar cada paso.
3. Corré las pruebas; verificá las reglas financieras con los casos concretos de la especificación.
4. No declares nada terminado sin verificarlo.
5. Nada de migraciones destructivas ni datos reales sin autorización de Valentín.
6. Datos de desarrollo siempre de ejemplo, nunca reales.
7. Documentá en `README.md` cómo iniciar, configurar y respaldar.

## Estado actual

- Etapa 1 (prototipo) hecha: ver `prototipo/`. Son mockups en formato `.dc.html` (HTML + una clase JS de lógica); sirven como referencia visual y de flujo, **no** son código a reutilizar.
- Etapa 2 (base del proyecto) hecha en local: monorepo, modelo de datos y migraciones, login (PBKDF2 20.000 iteraciones, medido), ajustes, auditoría inmutable, copias cifradas con restauración probada, CI. Decisiones y guía en `README.md`. Falta desplegar (Neon, Cloudflare) y medir el CPU real del login.
- Etapa 3 (clientes, fiados, cobros y carga inicial) hecha en local; ver la sección en `README.md`. Falta que el dueño pase dos hojas reales de prueba y coincidan con el papel.
- Etapa 4 (uso real 1) preparada: despliegue automático a un solo Worker (web + API) y guía en `docs/despliegue.md`. Falta que Valentín cree las cuentas (Neon, Cloudflare), cargue los secrets y que el dueño use fiados y cobros.
- Fotos de comprobantes (pedido de Valentín, adelantado del post-MVP): R2 + Cloudflare Images, solo dentro de lo gratis (aprobado así). Hoy en cobros; la tabla ya admite gastos para la Etapa 6.
- Etapa 5 (viajes y plata) hecha: anotar viaje, dónde está la plata, entregas con diferencia, Handy con comisión, días sin cargar. Ver la sección en `README.md`.
- Próximo paso: **Etapa 6 — gastos**. Pantallas nuevas de referencia en `prototipo/pantallas-nuevas/` (gastos, coches, choferes, empleados, ajustes).
- Hay pendientes para confirmar con el dueño (lista al final de la especificación). Mientras tanto, todo eso va configurable.
