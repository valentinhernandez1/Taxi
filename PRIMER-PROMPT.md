# Primer mensaje para Claude Code

Pegá esto en Claude Code una vez abierto el repositorio:

---

Leé `CLAUDE.md`, `docs/especificacion.md`, `docs/infraestructura.md` y mirá `prototipo/`. Es la app de gestión de la empresa de taxis de mi padre; el diseño y la infraestructura ya están decididos.

Arrancá la **Etapa 2 — base del proyecto**:

1. Monorepo pnpm con `apps/web` (React + Vite + Tailwind, PWA), `apps/api` (Hono para Cloudflare Workers) y `packages/shared`, en TypeScript.
2. PostgreSQL local con Docker Compose para desarrollo y Drizzle con las migraciones del modelo de datos, compatible con Neon.
3. Login del dueño (midiendo que el hash entre en el límite de CPU de Workers), pantalla de Ajustes básica y tabla de auditoría.
4. Script de copia con `pg_dump` y workflow de GitHub Actions para la copia diaria cifrada; guía de restauración en el README, probada de verdad.
5. Vitest configurado, con los casos 16 y 17 de la especificación (precisión y zona horaria) como primeras pruebas de las funciones de dinero.
6. Workflow de CI que corra tipos, lint y pruebas en cada push.

Todavía no despliegues a Cloudflare ni a Neon: primero que todo funcione local. Antes de escribir código, decime el plan de archivos en una lista corta. Después avanzá paso a paso, corré las pruebas y no des nada por terminado sin verificarlo.
