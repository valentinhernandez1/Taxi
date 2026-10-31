# App de gestión de taxis

App web (PWA) para que el dueño de una empresa de taxis chica controle fiados, cobros, caja, gastos, liquidaciones y ganancia desde el celular.

- `CLAUDE.md`: contexto y reglas para Claude Code.
- `docs/especificacion.md`: especificación completa del MVP.
- `docs/infraestructura.md`: Cloudflare Pages + Workers, Neon y GitHub Actions (todo gratis).
- `prototipo/`: mockups de las pantallas.

Stack: React + Vite (PWA) · Hono en Cloudflare Workers · PostgreSQL (Neon en producción) · Drizzle · GitHub Actions.

## Estructura

```
apps/
  api/        Hono para Cloudflare Workers
    src/db/schema.ts        modelo de datos (Drizzle)
    drizzle/                migraciones SQL (generadas y revisadas)
    src/auth/               contraseñas (PBKDF2), sesiones, límite de intentos
    src/servicios/          reglas + transacción + auditoría
    src/rutas/              validan y llaman a los servicios
    test/                   pruebas en workerd contra Postgres real
    scripts/                migrar, crear el dueño, medir el hash, datos de ejemplo
  web/        React + Vite + Tailwind, PWA
packages/
  shared/     dinero en centésimos, fechas de Uruguay, esquemas Zod (funciones puras + pruebas)
scripts/      copia.sh, restaurar.sh, verificar-copia.sh, probar-copia.sh
patches/      arreglo chico a postgres.js para Workers (ver más abajo)
```

## Arrancar en local

Hace falta Node 22, pnpm 10 (`corepack enable`) y Docker. Para las copias, además, `age` y el cliente de Postgres (`psql`, `pg_dump`).

```bash
pnpm install
cp .env.example .env
cp .env.example apps/api/.dev.vars
pnpm db:up            # Postgres 16 en Docker (localhost:5432)
pnpm db:migrate       # aplica apps/api/drizzle/*.sql
pnpm db:ejemplo       # opcional: datos inventados para mirar
pnpm dueno:crear -- dueno@ejemplo.uy   # pide la contraseña (12+ caracteres)
pnpm dev              # API en :8787 (wrangler) y web en :5173 (vite, con /api por proxy)
```

Abrí http://localhost:5173 y entrá con el email y la contraseña que creaste.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm typecheck` | Tipos en los tres paquetes |
| `pnpm lint` | ESLint (incluye la regla de no usar `parseFloat`/`toFixed` con dinero) |
| `pnpm test` | Vitest: reglas de dinero y fechas, API dentro de workerd contra Postgres. Necesita `pnpm db:up`; usa la base `taxis_test`, que borra y migra en cada corrida |
| `pnpm copia:probar` | Copia cifrada, restauración en base vacía y comparación, con datos de ejemplo |
| `pnpm db:generate` | Genera una migración nueva a partir de `schema.ts` (revisarla antes de subirla) |
| `pnpm --filter @taxis/api medir-hash` | Mide el costo de PBKDF2 dentro de workerd |

## Decisiones de la Etapa 2

1. **Driver de Postgres: postgres.js por TCP**, no el driver serverless de Neon. Es protocolo Postgres estándar: el mismo código anda contra el Postgres de Docker y contra Neon desde Workers (`nodejs_compat`), sin proxy local. Si después conviene el driver de Neon, se cambia solo `apps/api/src/db/cliente.ts`.
   - `patches/postgres@3.4.9.patch`: en Workers, al cerrar la conexión postgres.js emitía un `error` sin listeners y quedaba un rechazo sin manejar en los logs. El parche no cambia ningún resultado. Las pruebas ignoran solo el aviso de workerd por esa lectura cancelada (ver `apps/api/vitest.config.ts`).
2. **Hash de contraseña: PBKDF2-SHA256 con 20.000 iteraciones.** Workers no acepta más de 100.000, y el plan gratis da 10 ms de CPU. Medido en workerd (`medir-hash`):

   | Iteraciones | CPU aprox. |
   | --- | --- |
   | 10.000 | 1,3 ms |
   | 20.000 | 2,6 ms ← elegido |
   | 30.000 | 4,1 ms |
   | 50.000 | 7,6 ms |
   | 100.000 | 15 ms (no entra) |

   20.000 deja margen por si el hardware de Cloudflare es más lento y para el resto del pedido. Para compensar que no es un hash lento: contraseñas de 12+ caracteres, bloqueo de 15 minutos tras 5 fallos por email (o 20 por IP), y la cantidad de iteraciones va guardada en cada hash, así que se puede subir más adelante sin invalidar nada. **Al desplegar hay que confirmar el CPU real del login** en el panel de Cloudflare (Workers → taxis-api → Métricas → CPU time).
3. **Sesiones** en la tabla `sesion`: la cookie (`HttpOnly`, `Secure`, `SameSite=Strict`) lleva un token de 256 bits y la base guarda solo su SHA-256. Duran 30 días y se renuevan con el uso. Cambiar la contraseña cierra las otras sesiones. Los pedidos que cambian datos tienen que ser JSON, que junto con `SameSite=Strict` cubre CSRF.
4. **Auditoría** escrita por los servicios en la misma transacción que el cambio, con antes, después y motivo. Un trigger de la base rechaza `UPDATE` y `DELETE` sobre `auditoria`.
5. **Modelo de datos completo** (§5 de la especificación) en la primera migración, con `CHECK` para las reglas que la base puede garantizar sola: importes > 0, fiado con cliente, `op_key` único, diferencia de entrega = esperado − entregado. Se agregaron `sesion`, `intento_login` y `acreditacion_handy_viaje` (los viajes de cada acreditación). Las vistas de saldos llegan con su módulo.
6. **Ajustes** como `clave → valor JSON`, validados con Zod en `packages/shared`. Los no guardados usan su valor por defecto y cada cambio queda en la auditoría.

## Copias y restauración

Las copias son `pg_dump` en formato custom, cifradas con [age](https://age-encryption.org). Para cifrar alcanza la clave pública; la privada solo hace falta para restaurar y **nunca va a GitHub ni al servidor**.

### Preparar las claves (una vez)

```bash
age-keygen -o clave-copias.txt         # guardala en un lugar seguro, fuera del repo (gestor de contraseñas + pendrive)
age-keygen -y clave-copias.txt         # muestra la clave pública: age1...
```

### Copia diaria automática

`.github/workflows/copia-diaria.yml` corre todos los días a las 03:17 (hora de Uruguay) y también a mano, desde Actions → Copia diaria → Run workflow. Cada día:

1. hace `pg_dump` de producción;
2. **la restaura en un Postgres descartable y compara filas y totales de dinero contra producción**, así que cada copia guardada ya está probada;
3. la cifra con la clave pública y la guarda como artefacto por 30 días.

Necesita dos secrets en GitHub (Settings → Secrets and variables → Actions):

- `DATABASE_URL_PRODUCCION`: la cadena de Neon (la directa, no la del pooler).
- `AGE_RECIPIENT`: la clave pública `age1...`.

Mientras no estén cargados, el workflow avisa y termina sin hacer nada.

### Copia a mano

```bash
DATABASE_URL=... AGE_RECIPIENT=age1... scripts/copia.sh copias/
```

### Restaurar (guía probada)

1. Bajá la copia: Actions → Copia diaria → la corrida del día → Artifacts.
2. Creá una base **vacía**. En local: `createdb -h localhost -U taxis taxis_restaurada`; en Neon: una rama o base nueva.
3. Restaurá. El script se niega si la base de destino tiene tablas:
   ```bash
   AGE_IDENTITY=clave-copias.txt scripts/restaurar.sh taxis_AAAA-MM-DD_HHMM.dump.age postgres://.../taxis_restaurada
   ```
4. Si todavía tenés acceso al original, compará filas y totales de dinero tabla por tabla:
   ```bash
   scripts/verificar-copia.sh postgres://.../original postgres://.../taxis_restaurada
   ```
5. Apuntá la API a la base restaurada (`wrangler secret put DATABASE_URL`) y entrá a la app a mirar.

**Cómo se probó:** `scripts/probar-copia.sh` hace todo el ciclo con datos de ejemplo. Crea una base, la migra y la carga; hace la copia cifrada (y comprueba que no quedó en claro); la restaura en una base vacía; compara las 30 tablas en filas y en cada columna de dinero; comprueba que `verificar-copia.sh` detecta una diferencia de $ 0,01; y comprueba que la base restaurada sigue sin dejar borrar la auditoría. Corre en el CI en cada push (job "Copia y restauración"). Salida del 30/10/2026:

```
3. Restauración en base vacía
Restaurada en taxis_copia_restaurada
   (y se negó a restaurar encima de una base con datos)
4. Comparación
OK: 30 tablas iguales en filas y totales.
   (y detecta una diferencia de un centésimo)
5. La base restaurada sigue protegiendo la auditoría
   OK
Copia y restauración probadas.
```

## Pendiente para publicar (todavía no se despliega)

- [ ] Crear el proyecto en Neon, anotar la región y cargar `DATABASE_URL` como secret del Worker.
- [ ] Desplegar API y web con la ruta `/api` del Worker en el mismo dominio que Pages.
- [ ] Medir el CPU real del login en Cloudflare.
- [ ] Confirmar si Cron Triggers entra en el plan gratis (para los avisos).
- [ ] Cargar los secrets de la copia diaria y bajar/restaurar la primera copia real en una base de prueba.
