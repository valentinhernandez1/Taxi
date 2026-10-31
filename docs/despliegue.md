# Publicar la app (Etapa 4)

Guía para poner la app en internet la primera vez. Todo en planes gratuitos. Los comandos son para PowerShell (Windows).

## Cómo queda armado

- **Un solo Worker de Cloudflare** (`taxis`) sirve la web y la API (`/api`), en la dirección `https://taxis.<tu-subdominio>.workers.dev`. Mismo dominio para las dos cosas, así la cookie de sesión funciona sin configurar nada. Los archivos de la web los entrega Cloudflare sin ejecutar el Worker: no gastan pedidos ni CPU. Configuración: `apps/api/wrangler.produccion.jsonc`.
- **Neon** guarda la base de datos.
- **GitHub Actions** despliega solo: en cada push a `main`, si pasan todas las pruebas, aplica las migraciones en Neon, compila la web y publica el Worker. Al final comprueba que la app responde y que llega a la base. Además hace la copia diaria cifrada.

Cambio respecto de `docs/infraestructura.md`: se usa Workers con archivos estáticos en vez de Pages + Worker. Es lo que Cloudflare recomienda hoy, sigue siendo gratis, y queda un solo despliegue en un solo dominio.

## 1. Neon (la base)

1. Entrá a https://neon.tech y creá la cuenta (se puede con GitHub).
2. **New project**:
   - Nombre: `taxis`.
   - Versión de Postgres: **16** (la misma que en desarrollo y en el CI).
   - Región: la más cercana a Uruguay que ofrezca. AWS São Paulo (`sa-east-1`) si aparece; si no, `us-east-1`. **Anotá cuál elegiste**: ahí quedan los datos.
3. En el panel del proyecto, **Connect**. Desactivá **Connection pooling** y copiá la cadena (empieza con `postgresql://` y termina con `?sslmode=require&channel_binding=require`). Es la "conexión directa": sirve para la app, las migraciones y las copias.

No la pegues en ningún archivo del repositorio: va solo en los secrets de GitHub (paso 4).

## 2. Cloudflare (la app)

1. Entrá a https://dash.cloudflare.com y creá la cuenta.
2. **Workers & Pages**: la primera vez te pide elegir un subdominio `*.workers.dev`. Elegí algo corto (por ejemplo `taxis-sancarlos`). La app va a quedar en `https://taxis.taxis-sancarlos.workers.dev`.
3. **Account ID**: en Workers & Pages, columna de la derecha. Copialo.
4. **Token para GitHub**: arriba a la derecha, tu perfil → **API Tokens** → **Create Token** → plantilla **Edit Cloudflare Workers** → en "Account Resources" elegí tu cuenta → **Continue** → **Create Token**. Copialo (se muestra una sola vez).

## 2b. Fotos de comprobantes (R2 + Images)

La app guarda fotos de comprobantes (por ahora, de los cobros por transferencia) en **R2** y usa **Cloudflare Images** para achicarlas y sacar la miniatura.

1. **Activar R2** (una vez): en el panel, **R2 Object Storage** → **Purchase R2 Plan** / activar. Cloudflare puede pedir una tarjeta aunque no cobre nada mientras se quede dentro de lo gratis. El bucket `taxis-comprobantes` lo crea solo el despliegue.
2. **Token**: la plantilla "Edit Cloudflare Workers" del paso 2 tiene que incluir **Workers R2 Storage: Edit**. Si el despliegue falla en "Bucket de fotos de comprobantes", agregale ese permiso al token.
3. **Images** no hay que activarlo: el plan gratis ya incluye las transformaciones.

Qué es gratis (comprobado en la documentación de Cloudflare el 31/10/2026):

| Servicio | Gratis por mes | Uso estimado de la app |
| --- | --- | --- |
| R2 | 10 GB guardados, 1 millón de escrituras, 10 millones de lecturas | Una foto ≈ 40–300 KB: miles de fotos por GB |
| Images | 5.000 transformaciones distintas | 2 por foto subida (copia + miniatura); ver las fotos no cuenta |

Si algún mes se pasara de las 5.000 transformaciones, Images **no cobra**: da error, y la app guarda la foto igual, sin miniatura. Para pasar de lo gratis en R2 habría que guardar más de 10 GB, que son decenas de miles de fotos.

**Las fotos no entran en la copia diaria** (que es de la base). R2 guarda varias copias de cada archivo y la app nunca borra fotos (solo las marca anuladas), pero si se quiere una copia propia hay que agregarla aparte (pendiente).

## 3. Clave de las copias (age)

```powershell
winget install FiloSottile.age
```

Cerrá y abrí PowerShell. Generá el par de claves **fuera** de la carpeta del repo:

```powershell
cd $HOME
age-keygen -o clave-copias.txt
```

Muestra la clave pública (`Public key: age1...`). Copiala.

**La clave privada (`clave-copias.txt`) es la única forma de abrir las copias.** Guardala en dos lugares seguros (por ejemplo, gestor de contraseñas y un pendrive). Si se pierde, las copias no sirven; si alguien la consigue, puede leer los datos.

## 4. Secrets en GitHub

En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Cargá estos cuatro:

| Nombre | Valor |
| --- | --- |
| `DATABASE_URL_PRODUCCION` | La cadena de Neon del paso 1 |
| `CLOUDFLARE_API_TOKEN` | El token del paso 2 |
| `CLOUDFLARE_ACCOUNT_ID` | El Account ID del paso 2 |
| `AGE_RECIPIENT` | La clave pública `age1...` del paso 3 |

Opcional pero recomendado: **Settings → Environments → produccion → Required reviewers** y agregate. Así ningún despliegue sale sin que lo apruebes.

## 5. Primer despliegue

**Actions → CI → Run workflow** (rama `main`). Cuando termina, el job **Desplegar a producción** muestra al final `Publicado en https://...`.

Si falla, el log dice en qué paso: migraciones (problema con la cadena de Neon), despliegue (problema con el token o el Account ID) o la comprobación final (la app no llega a la base).

## 6. Crear el usuario del dueño en producción

Desde tu PC, en la carpeta del repo. La contraseña te la pide por teclado (12 caracteres o más; una frase es fácil de recordar):

```powershell
$env:DATABASE_URL = "PEGÁ_ACÁ_LA_CADENA_DE_NEON"
pnpm dueno:crear -- el-email-de-tu-padre@ejemplo.com
Remove-Item Env:DATABASE_URL
```

El último comando borra la cadena de la sesión de PowerShell, para no usarla sin querer contra producción después.

## 7. En el celular de tu padre

1. Abrí la dirección de la app en el navegador del celular y entrá.
2. Agregala a la pantalla de inicio para que quede como una app:
   - **Android (Chrome)**: menú ⋮ → **Instalar app** (o "Agregar a la pantalla principal").
   - **iPhone (Safari)**: botón Compartir → **Agregar a inicio**.

## 8. Verificaciones pendientes de `docs/infraestructura.md`

1. **CPU del login**: Workers & Pages → `taxis` → **Observability** (o Logs). Buscá los pedidos `POST /api/auth/login` y mirá el **CPU time**. Con 20.000 iteraciones se midió ~2,6 ms en local; tiene que quedar holgado debajo de 10 ms. Si pasa de 8 ms seguido, bajá `ITERACIONES_PBKDF2` en `apps/api/src/auth/password.ts` (los hashes viejos se actualizan solos en el próximo login).
2. **Cron Triggers** (para los avisos de vencimientos, Etapa 6): en `taxis` → **Settings → Triggers** fijate si deja agregar un Cron Trigger con el plan gratis.
3. **Región de Neon**: anotala en `docs/infraestructura.md`.
4. **Primera copia real**: Actions → **Copia diaria** → Run workflow. Ese workflow ya restaura cada copia en una base descartable y la compara con producción antes de guardarla. Además, una vez, bajá el artefacto y restauralo en tu Postgres local siguiendo "Restaurar" en el `README.md` (los scripts de copia son de bash: usá Git Bash o WSL).

## Primeros días de uso (Etapa 4)

1. **Configurar**: Más → Choferes y personal (los choferes y la telefonista), Más → Coches, Más → Ajustes (nombre de la empresa).
2. **Hojas de papel**: empezar con **dos** hojas de clientes. Deben → Cliente nuevo → Cargar la hoja de papel. La app no guarda la hoja si el total no coincide con el papel. Este es el criterio de "listo" de la Etapa 3.
3. **Uso diario**: anotar fiados y cobros todos los días, durante una o dos semanas, sin tirar las hojas de papel. Al final, comparar el "Te deben en total" con el papel.
4. **Si se equivoca**: en la ficha del cliente, "Anular…" con un motivo. No se borra nada; queda tachado y en el historial.
5. Anotá todo lo que le resulte confuso o lento: eso define los ajustes antes de seguir con la Etapa 5 (viajes y plata).

## Si algo sale mal

- **Volver a la versión anterior de la app**: Workers & Pages → `taxis` → **Deployments** → la versión anterior → **Rollback**. No toca la base.
- **Restaurar la base**: ver "Restaurar" en el `README.md`. Siempre en una base nueva; después se cambia el secret `DATABASE_URL_PRODUCCION` y se vuelve a desplegar.
