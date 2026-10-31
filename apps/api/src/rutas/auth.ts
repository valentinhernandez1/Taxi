import { esquemaLogin, esquemaPasswordNueva } from "@taxis/shared";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { estaBloqueado, registrarIntento } from "../auth/limite";
import { HASH_DE_RELLENO, hashearPassword, verificarPassword } from "../auth/password";
import { borrarCookie, cerrarOtrasSesiones, cerrarSesion, crearSesion, ponerCookie } from "../auth/sesion";
import { usuario } from "../db/schema";
import type { AppEnv } from "../env";
import { ErrorNegocio } from "../errores";
import { requiereSesion } from "../middleware";
import { registrarAuditoria } from "../servicios/auditoria";

export const rutasAuth = new Hono<AppEnv>();

rutasAuth.post("/login", async (c) => {
  const { email, password } = esquemaLogin.parse(await c.req.json());
  const db = c.var.db;
  const ip = c.req.header("cf-connecting-ip") ?? "local";

  if (await estaBloqueado(db, email, ip)) {
    throw new ErrorNegocio("Hubo demasiados intentos. Esperá 15 minutos y probá de nuevo.", 429);
  }

  const [encontrado] = await db
    .select()
    .from(usuario)
    .where(and(sql`lower(${usuario.email}) = ${email}`, eq(usuario.activo, true)))
    .limit(1);
  // Si el email no existe se verifica igual, para que tarde lo mismo.
  const { valida, rehashear } = await verificarPassword(password, encontrado?.hash_password ?? HASH_DE_RELLENO);
  const exito = Boolean(encontrado) && valida;
  await registrarIntento(db, email, ip, exito);
  if (!encontrado || !exito) throw new ErrorNegocio("El email o la contraseña no coinciden", 401);

  if (rehashear) {
    await db.update(usuario).set({ hash_password: await hashearPassword(password) }).where(eq(usuario.id, encontrado.id));
  }
  const { token, expira } = await crearSesion(db, encontrado.id);
  await registrarAuditoria(db, {
    tabla: "usuario",
    registroId: encontrado.id,
    accion: "login",
    despues: { ip },
    usuarioId: encontrado.id,
  });
  ponerCookie(c, token, expira);
  return c.json({ usuario: { id: encontrado.id, email: encontrado.email, rol: encontrado.rol } });
});

rutasAuth.post("/logout", requiereSesion, async (c) => {
  await cerrarSesion(c.var.db, c.var.sesionHash);
  await registrarAuditoria(c.var.db, {
    tabla: "usuario",
    registroId: c.var.usuario.id,
    accion: "logout",
    usuarioId: c.var.usuario.id,
  });
  borrarCookie(c);
  return c.json({ ok: true });
});

rutasAuth.get("/yo", requiereSesion, (c) => c.json({ usuario: c.var.usuario }));

const esquemaCambioPassword = z.object({ actual: z.string().min(1).max(200), nueva: esquemaPasswordNueva });

rutasAuth.post("/password", requiereSesion, async (c) => {
  const { actual, nueva } = esquemaCambioPassword.parse(await c.req.json());
  const db = c.var.db;
  const yo = c.var.usuario;
  const [fila] = await db.select({ hash: usuario.hash_password }).from(usuario).where(eq(usuario.id, yo.id));
  if (!fila || !(await verificarPassword(actual, fila.hash)).valida) {
    throw new ErrorNegocio("La contraseña actual no coincide", 400);
  }
  const hash = await hashearPassword(nueva);
  await db.transaction(async (tx) => {
    await tx.update(usuario).set({ hash_password: hash }).where(eq(usuario.id, yo.id));
    await registrarAuditoria(tx, { tabla: "usuario", registroId: yo.id, accion: "cambiar_password", usuarioId: yo.id });
  });
  await cerrarOtrasSesiones(db, yo.id, c.var.sesionHash);
  return c.json({ ok: true });
});
