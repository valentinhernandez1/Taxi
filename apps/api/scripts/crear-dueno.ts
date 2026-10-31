/**
 * Crea el usuario del dueño, o le cambia la contraseña si ya existe.
 *   pnpm dueno:crear -- dueno@ejemplo.uy
 * La contraseña se pide por teclado (no queda en el historial de la terminal).
 * Para scripts: DUENO_PASSWORD=... pnpm dueno:crear -- email
 */
import { esquemaPasswordNueva } from "@taxis/shared";
import { sql } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { hashearPassword } from "../src/auth/password";
import { conectar } from "../src/db/cliente";
import { usuario } from "../src/db/schema";
import { registrarAuditoria } from "../src/servicios/auditoria";
import { urlDeLaBase } from "./entorno";

/**
 * Lee una línea sin mostrarla: tecla por tecla en modo crudo, con un * por
 * carácter. (El truco de readline para ocultar no anda en la consola de Windows.)
 */
async function leerOculto(pregunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY) {
    // Entrada redirigida (scripts, CI): una línea tal cual.
    const rl = createInterface({ input: entrada });
    const linea = await rl.question("");
    rl.close();
    return linea;
  }
  process.stdout.write(pregunta);
  entrada.setRawMode(true);
  entrada.setEncoding("utf8");
  entrada.resume();
  return new Promise((resolver) => {
    let texto = "";
    const terminar = () => {
      entrada.off("data", alTeclear);
      entrada.setRawMode(false);
      entrada.pause();
      process.stdout.write("\n");
    };
    function alTeclear(datos: string) {
      for (const c of datos) {
        if (c === "\r" || c === "\n") {
          terminar();
          return resolver(texto);
        }
        if (c === "\u0003") {
          terminar();
          process.exit(130); // Ctrl+C
        }
        if (c === "\u007f" || c === "\b") {
          if (texto) {
            texto = texto.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (c >= " ") {
          texto += c;
          process.stdout.write("*");
        }
      }
    }
    entrada.on("data", alTeclear);
  });
}

async function pedirPassword(): Promise<string> {
  if (process.env.DUENO_PASSWORD) return process.env.DUENO_PASSWORD;
  const primera = await leerOculto("Contraseña (12+ caracteres): ");
  const repetida = await leerOculto("Repetila: ");
  if (primera !== repetida) {
    console.error("Las dos contraseñas no son iguales. No se cambió nada.");
    process.exit(1);
  }
  return primera;
}

const email = process.argv.slice(2).find((a) => a !== "--")?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Uso: pnpm dueno:crear -- dueno@ejemplo.uy");
  process.exit(1);
}

const url = new URL(urlDeLaBase());
const esLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
console.log(`Base de datos: ${url.hostname}${url.pathname}${esLocal ? "  ← LOCAL (Docker), no la app publicada" : ""}`);
if (esLocal) console.log("Para la app publicada, cargá antes la cadena de Neon: $env:DATABASE_URL = \"...\"");

const leida = esquemaPasswordNueva.safeParse(await pedirPassword());
if (!leida.success) {
  console.error(leida.error.issues[0]?.message ?? "Contraseña inválida");
  process.exit(1);
}
const password = leida.data;
const { db, cerrar } = conectar(url.toString());
try {
  const hash = await hashearPassword(password);
  await db.transaction(async (tx) => {
    const existentes = await tx.select({ id: usuario.id }).from(usuario).where(sql`lower(${usuario.email}) = ${email}`);
    if (existentes[0]) {
      await tx.update(usuario).set({ hash_password: hash, activo: true }).where(sql`${usuario.id} = ${existentes[0].id}`);
      await registrarAuditoria(tx, {
        tabla: "usuario",
        registroId: existentes[0].id,
        accion: "cambiar_password",
        motivo: "Cambio desde la terminal (crear-dueno)",
        usuarioId: null,
      });
      console.log(`Contraseña actualizada para ${email}`);
    } else {
      const [nuevo] = await tx.insert(usuario).values({ email, hash_password: hash, rol: "dueno" }).returning({ id: usuario.id });
      await registrarAuditoria(tx, {
        tabla: "usuario",
        registroId: nuevo!.id,
        accion: "crear",
        despues: { email, rol: "dueno" },
        motivo: "Alta desde la terminal (crear-dueno)",
        usuarioId: null,
      });
      console.log(`Usuario dueño creado: ${email}`);
    }
  });
} finally {
  await cerrar();
}
