# Infraestructura

Decidida el 30 de octubre de 2026. Costo objetivo: $ 0 por mes. Límites verificados ese día en las páginas oficiales; revisarlos de nuevo antes de publicar.

## Piezas

| Pieza | Servicio | Uso |
| --- | --- | --- |
| Web (PWA) | Cloudflare Workers (archivos estáticos) | `apps/web` compilada con Vite, servida por el mismo Worker que la API. Dirección inicial `taxis.<subdominio>.workers.dev`. Los archivos estáticos no ejecutan el Worker ni cuentan pedidos. *(Cambio de la Etapa 4: antes era Cloudflare Pages; ver `docs/despliegue.md`.)* |
| API | Cloudflare Workers + Hono | `apps/api`, en la ruta `/api` del mismo dominio, para que la cookie de sesión funcione sin CORS. |
| Base de datos | Neon (PostgreSQL) | Una rama `main` para producción y otra para pruebas. Conexión con el driver serverless. |
| Copias | GitHub Actions | Tarea diaria: `pg_dump` → cifrado (age o gpg con clave guardada como secret) → artefacto o repo privado de copias. Retener al menos 30 días. |
| CI | GitHub Actions | En cada push: tipos, lint, Vitest, prueba de copia. En `main`: migraciones en Neon y despliegue del Worker (web + API). |
| Avisos | Web Push (VAPID) | Disparado por un cron (Cron Trigger de Workers si el plan gratis lo incluye; si no, GitHub Actions llamando a un endpoint protegido). |
| Secretos | Variables de Cloudflare y secrets de GitHub | Nunca en el repositorio. `.env.example` documenta cuáles hacen falta. |

## Límites del plan gratis

| Servicio | Límite | Qué implica |
| --- | --- | --- |
| Workers | 100.000 pedidos/día, 10 ms de CPU por pedido | De sobra en volumen. Cuidar el CPU: hash de contraseña liviano, consultas resueltas en la base y no en JS. |
| Neon | 1 GB por proyecto, 100 CU-hora, se suspende a los 5 min, historial 6 h | Volumen de sobra. Primer pedido tras la pausa con demora corta. Copias propias obligatorias. |
| Workers (archivos estáticos) | Gratis, no cuentan como pedidos | Sin problema. |

## Descartados

- **Render:** el servidor gratis se apaga a los 15 min y tarda cerca de 1 minuto en volver; la base gratis expira a los 30 días.
- **Supabase:** el proyecto gratis se pausa tras 7 días sin uso, 500 MB y sin copias diarias.

## Primeras verificaciones de la Etapa 2

1. Medir el CPU del login en Workers y elegir el hash que entre en 10 ms.
2. Confirmar si Cron Triggers está incluido en el plan gratis.
3. Hacer una copia, borrarla en una base vacía de prueba, restaurarla y comparar conteos y totales. Documentarlo en el README.
4. Confirmar la región de Neon y anotar dónde quedan los datos.

## Fuentes

- https://neon.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/
- https://render.com/docs/free
- https://automationatlas.io/answers/supabase-free-tier-limits-2026/
