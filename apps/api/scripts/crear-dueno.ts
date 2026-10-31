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

async function pedirPassword(): Promise<string> {
  if (process.env.DUENO_PASSWORD) return process.env.DUENO_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pregunta = rl.question("Contraseña (12+ caracteres): ");
  // La pregunta ya se escribió; desde acá no se muestra lo que se teclea.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
  const password = await pregunta;
  rl.close();
  process.stdout.write("\n");
  return password;
}

const email = process.argv.slice(2).find((a) => a !== "--")?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Uso: pnpm dueno:crear -- dueno@ejemplo.uy");
  process.exit(1);
}

const password = esquemaPasswordNueva.parse(await pedirPassword());
const { db, cerrar } = conectar(urlDeLaBase());
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
