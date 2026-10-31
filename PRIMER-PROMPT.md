# Primer mensaje para Claude Code

Pegá esto en Claude Code una vez abierto el repositorio:

---

Leé `CLAUDE.md`, `docs/especificacion.md` y mirá `prototipo/`. Es la app de gestión de la empresa de taxis de mi padre; el diseño ya está validado.

Arrancá la **Etapa 2 — base del proyecto**:

1. Monorepo pnpm con `apps/web`, `apps/api` y `packages/shared`, en TypeScript.
2. PostgreSQL con Docker Compose para desarrollo y Drizzle con las migraciones del modelo de datos.
3. Login del dueño, pantalla de Ajustes básica y tabla de auditoría.
4. Script de copia con `pg_dump` y guía de restauración en el README, probada de verdad.
5. Vitest configurado con los casos 16 y 17 de la especificación (precisión y zona horaria) como primeras pruebas de las funciones de dinero.

Antes de escribir código, decime el plan de archivos en una lista corta. Después avanzá paso a paso, corré las pruebas y no des nada por terminado sin verificarlo.
