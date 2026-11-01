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

### En Windows (PowerShell)

1. Instalá Node 22 y Docker Desktop (y dejalo abierto):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Docker.DockerDesktop
   ```
2. Cerrá y abrí PowerShell, y activá pnpm (si da error de permisos, abrí PowerShell como administrador):
   ```powershell
   corepack enable
   ```
   Si `corepack` no anda: `npm install -g pnpm@10`.
3. Desde la carpeta del repo, los mismos pasos de arriba, pero copiando los archivos con `Copy-Item`:
   ```powershell
   pnpm install
   Copy-Item .env.example .env
   Copy-Item .env.example apps/api/.dev.vars
   pnpm db:up
   pnpm db:migrate
   pnpm db:ejemplo
   pnpm dueno:crear -- dueno@ejemplo.uy
   pnpm dev
   ```

Todo eso anda igual en Windows. Los scripts de copias (`scripts/*.sh`) son de bash: corren en Git Bash o WSL, y además el CI los prueba en cada push.

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

## Etapa 3: clientes, fiados y cobros

Pantallas: **Quién debe** (total, colores por antigüedad, búsqueda), **ficha del cliente** (saldo, viajes y pagos, anular con motivo, recordatorio por WhatsApp, límite), **Anotar cobro** y **Anotar fiado** (una pregunta por pantalla, resumen antes de guardar), **hoja de papel** (carga inicial) y **Choferes y personal / Coches** en Más.

1. **Saldos calculados, nunca escritos** (regla 5). Las vistas `fiado_pendiente` y `saldo_cliente` (migración 0003) calculan lo que debe cada viaje y cada cliente desde viajes, cobros e imputaciones. Anular un cobro lo saca de la cuenta sin borrar nada.
2. **FIFO** con `imputarFIFO` de `packages/shared`: la API la usa para guardar y la web para mostrar el resumen "se descuenta de lo más viejo" antes de guardar; calculan lo mismo.
3. **Los cobros ya mueven plata** (tabla `movimiento`): de "afuera" a la caja (lo recibió el dueño), al banco (transferencia) o a lo que tiene que entregar la persona que lo recibió (caso 7). Así, cuando llegue la pantalla de Plata (Etapa 5), la historia desde el primer día de uso real ya está. Anular un cobro agrega el movimiento inverso. Las cuentas base (caja, banco, Handy, afuera) las crea la migración 0003.
4. **Pago mayor que la deuda** (caso 4): la API responde 409 y pide confirmación; confirmado, queda a favor y se usa sola en el próximo fiado. **Límite de fiado** (caso 20): igual, 409 con aviso y se guarda solo si el dueño confirma.
5. **Doble envío** (caso 5): cada asistente genera un `op_key` al empezar; si el mismo pedido llega dos veces (incluso a la vez) queda uno solo.
6. **Carga inicial**: los renglones de la hoja entran como viajes `carga_inicial` (no suman a la facturación del mes ni a liquidaciones, caso 15) y los pagos anotados como cobros `carga_inicial`, que no mueven plata de hoy. No se guarda nada si los renglones menos los pagos no dan el total que dice la hoja.
7. **Alertas**: amarillo y rojo por días desde el fiado más viejo sin pagar (30 y 60 por defecto, en Ajustes). Si el cliente tiene plazo propio, pasa a rojo al vencerse y a amarillo la semana antes.
8. **Anular un fiado** que ya tiene pagos aplicados no se deja: primero se anulan esos cobros (si no, los pagos quedarían colgando).
9. **Quién recibió la plata**: "Vos" (el dueño) va a la caja; para elegir a otra persona hay que darla de alta en Más → Choferes y personal.

**Listo cuando** (especificación §8): las pruebas de fiados pasan (`apps/api/test/fiados.test.ts`, casos 1–7, 14, 15 y 20) y **dos hojas reales de prueba coinciden con el papel**. Esto último lo tiene que hacer el dueño con dos hojas suyas, en la base de prueba.

## Etapa 5: viajes y plata

Pantallas: **Anotar viaje** (día → chofer → coche → importe → ¿cómo pagó? → [cliente si es fiado] → resumen; "Guardar y anotar otro" mantiene día, chofer y coche), **Dónde está la plata** (caja, banco, Handy por acreditar, quién tiene plata y desde cuándo), **Recibir plata** ("Entregó justo" o "otra cantidad" con nota obligatoria), **Handy: ya cayó al banco**, y **Viajes anotados** (en Más: los viajes de cada día con totales por forma de pago, anular con motivo, "ese día no se trabajó"). En el inicio: botón "Anotar viaje", tarjeta de plata y aviso de días sin cargar de la última semana.

1. **A dónde va la plata de cada viaje** (todo como `movimiento`, regla 5): efectivo → lo tiene el chofer hasta que lo entrega (o la caja, si manejó el dueño o no se sabe quién); tarjeta → "a acreditar por Handy"; fiado → no mueve plata (caso 1, usa el mismo servicio que "Anotar fiado").
2. **Saldos por lugar**: vista `saldo_cuenta` (migración 0006) = lo que entró − lo que salió de cada cuenta. Ninguna columna de saldo.
3. **Entregas** (caso 8): lo esperado es el saldo de la persona; si entrega distinto, la nota es obligatoria, la diferencia queda en `entrega` y su saldo vuelve a cero (el faltante sale "afuera"; lo que entregó de más entra desde "afuera").
4. **Handy** (caso 9): al decir cuánto cayó al banco, la diferencia con lo que había es la comisión y se anota sola como gasto pagado desde Handy (categoría "Comisión Handy"). Si cae más de lo que había, se rechaza. Los viajes con tarjeta incluidos quedan en `acreditacion_handy_viaje` y ya no se pueden anular.
5. **Días sin cargar** (regla 9, caso 16): `GET /api/viajes/dias?desde&hasta` dice qué días no tienen viajes ni están marcados "no se trabajó" (`dia_sin_trabajo`, migración 0005). Lo van a usar los totales del panel para decir "incompleto".
6. **Categorías de gasto base** (migración 0006): Combustible, Taller, Cuota del coche (marcada aparte, regla 11), BPS, DGI, Comisión Handy, etc. Se editan en la Etapa 6.

**Pruebas**: `apps/api/test/plata.test.ts` (casos 1, 8, 9 y 16, anulaciones, doble envío) y `packages/shared/src/plata.test.ts`.

## Etapa 6: gastos

Pantallas: **Anotar gasto** (¿qué gasto? → ¿de qué coche? → ¿qué día? → ¿cuánto? → ¿ya está pagado? → ¿con qué plata? → resumen; después se le puede sacar foto al ticket), **Gastos del mes** (pagado / pendiente, cuotas aparte, aviso de mes incompleto, "Ya lo pagué", anular), **Vencimientos** (lo que vence en 30 días, lo vencido arriba en rojo, "Ya lo pagué", "Avisame mañana", "Este mes no corresponde"), **Gastos fijos** y **Tipos de gasto** (en Más), **Empleados y pagos** (pagos por concepto y aguinaldo estimado) con su asistente, y **Ficha de cada coche** (Más → Coches → tocar el coche). En el inicio: botón "Anotar gasto" y aviso de lo que hay para pagar.

1. **Pendiente vs. pagado** (caso 13): un gasto pendiente cuenta en el mes (devengado) pero no mueve plata; al pagarlo sale del lugar elegido como `movimiento`.
2. **¿Con qué plata?**: caja, banco o la plata que tiene una persona (por ejemplo, la recaudación de un chofer: baja lo que te tiene que entregar).
3. **Cuotas de coches aparte** (regla 11, caso 19): la categoría "Cuota del coche" está marcada `es_cuota_vehiculo`; los totales y la ficha del coche la muestran debajo, en "después de cuota". Una cuota tiene que tener coche.
4. **Vencimientos**: se generan solos (idempotente) desde cada gasto fijo según frecuencia (mensual, cada dos meses, anual o meses elegidos), día del mes (31 → último día en meses cortos), fecha de fin y cantidad de cuotas (`packages/shared/src/gastos.ts`). Avisan 3 días antes y el mismo día (configurable por gasto fijo). "Ya lo pagué" crea el gasto **del período que vence** con el importe real. Anular ese gasto deja el vencimiento otra vez pendiente.
5. **Aguinaldo estimado**: la doceava parte de sueldos, jornales y adelantos del semestre (dic–may se paga en junio; jun–nov en diciembre). Siempre dice "estimado"; lo confirma el contador.
6. **Ficha de coche**: facturado del coche − gastos de funcionamiento = resultado antes de cuota; abajo, la cuota y el resultado después de cuota. La parte de los choferes se descuenta cuando estén las liquidaciones (Etapa 7); hasta entonces la ficha lo aclara en vez de inventar un número.
7. **La comisión de Handy** no se elige a mano ni se anula: sale sola de la acreditación (caso 9).
8. Migración 0007: `gasto_fijo.primer_periodo` (las filas que existan toman el mes en que se crearon) y `vencimiento.avisar_desde` ("Avisame mañana"). No borra nada.

**Pruebas**: `apps/api/test/gastos.test.ts` (casos 13 y 19, con qué plata, anulaciones, doble envío, categorías, vencimientos, empleados, ficha de coche) y `packages/shared/src/gastos.test.ts`.

## Etapa 7: liquidación de choferes

Pantallas: **Liquidar turno** (Inicio; ¿qué chofer terminó? → ¿están todos los viajes? → ¿pagó algo con la plata del turno? → la cuenta según su regla → ¿cuánto entregó? → resumen), **Choferes y liquidaciones** (Más: lista con la regla de cada uno, "Sin confirmar", lo que tiene para entregar y los viajes sin liquidar), **ficha del chofer** (regla vigente y futuras, confirmar, liquidaciones con anular) y **cómo se le paga** (formulario de la regla).

1. **Cálculo puro** en `packages/shared/src/liquidacion.ts` (la API lo usa para guardar y la web lo muestra): porcentaje, jornal, mixto o sueldo; "se queda con su parte" o "entrega todo y se le paga" (el neto es el mismo); fiados A (se le adelanta su parte, se muestra aparte, caso 10) o B (se le paga cuando el cliente termina de pagar, caso 11); combustible pagado con la plata del turno (caso 12).
2. **Qué entra**: los viajes del chofer que todavía no se liquidaron (`viaje.liquidacion_id` nulo) hasta el día de la liquidación. Mientras no haya turnos (Etapa 9) se liquida "lo que tenga sin liquidar"; con turnos se va a poder elegir el turno.
3. **La plata**: lo que tiene que entregar sale de su saldo real (viajes en efectivo, cobros que recibió, lo que pagó) menos su parte. Su parte sale como `movimiento` ("parte_chofer"), lo que entrega va a la caja y la diferencia queda con nota. Si da negativo, la empresa le paga de la caja. Después de liquidar, su saldo queda en cero.
4. **Reglas con vigencia** (regla 12): cada regla rige desde una fecha; una nueva o cambiada queda **sin confirmar** hasta que el dueño la confirma en la ficha, y las liquidaciones hechas con una regla sin confirmar lo muestran. Una regla que ya se usó no se cambia: se carga otra desde otra fecha.
5. **Anular una liquidación** (con motivo) revierte su plata, anula el gasto del turno y deja los viajes otra vez sin liquidar. Mientras esté vigente, sus viajes, fiados y su gasto no se pueden anular sueltos.
6. **Doble envío**: si la misma liquidación llega dos veces a la vez, la segunda espera el bloqueo del chofer y devuelve la primera.
7. **Pendiente para confirmar con el dueño**: qué pasa con un fiado que no se cobra nunca (empresa o chofer) queda guardado en la regla, pero todavía no hay forma de marcar un fiado como incobrable; y la regla B paga la parte del chofer cuando el cliente termina de pagar ese viaje (no en pagos parciales).
8. Migración 0008: `viaje.liquidacion_id`, `viaje.parte_fiado_liquidacion_id`, `gasto.liquidacion_id`, y en `liquidacion`: `parte_fiados_cobrados`, `nota`, `anulado_en`, `motivo_anulacion`. Solo agrega.

**Pruebas**: `apps/api/test/liquidacion.test.ts` (casos 10, 11 y 12, nota por diferencia, la empresa le paga, sin regla, jornal, doble envío, anular, reglas con vigencia y confirmación) y `packages/shared/src/liquidacion.test.ts`.

## Fotos de comprobantes (R2 + Cloudflare Images)

En la ficha del cliente, cada cobro tiene "Agregar foto del comprobante", y al terminar un cobro por transferencia la app ofrece sacarle foto.

1. **En el celular** la foto se achica antes de subir (1.600 px como máximo, JPEG): ~40–300 KB.
2. **En el Worker** (`apps/api/src/servicios/comprobantes.ts`): se valida que sea JPEG, PNG o WebP por sus primeros bytes (no por lo que diga el navegador), máximo 5 MB. Images se usa **una sola vez por foto**: guarda una copia normalizada (sin datos ocultos como el GPS) y una miniatura de 320 px, las dos en R2. Verlas no vuelve a usar Images, así que el uso queda muy lejos de las 5.000 transformaciones gratis por mes. Si Images falla o se pasa del límite, se guarda la foto tal cual, sin miniatura.
3. **Privadas**: el bucket no es público; las fotos solo se ven con la sesión del dueño (`GET /api/comprobantes/:id/foto|miniatura`). Nada se borra: una foto equivocada se anula con motivo y queda en R2 y en la auditoría.
4. **Tabla** `comprobante` (migración 0004): de qué registro es (`cobro` o `gasto`, listo para la Etapa 6), clave en R2, tamaño y medidas.
5. **En local** R2 e Images se simulan (`wrangler dev`, pruebas): no tocan la cuenta ni cuestan.

Activación en producción y límites gratis: `docs/despliegue.md`, sección "Fotos de comprobantes".

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

## Publicar

Guía paso a paso (Neon, Cloudflare, secrets de GitHub, usuario del dueño, celular y verificaciones): **[docs/despliegue.md](docs/despliegue.md)**.

Resumen: un solo Worker (`apps/api/wrangler.produccion.jsonc`) sirve la web y la API en el mismo dominio. En cada push a `main` con todo en verde, el CI aplica las migraciones en Neon, compila la web y despliega (job "Desplegar a producción"). Mientras no estén cargados los secrets, ese job avisa y no hace nada.

Seguridad en producción: cookie `Secure`/`HttpOnly`/`SameSite=Strict`, CSP estricta en la web (`apps/web/public/_headers`, todo del mismo dominio) y en la API (`default-src 'none'`), `Cache-Control: no-store` en la API, HSTS.
