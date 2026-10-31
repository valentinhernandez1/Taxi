import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { MAXIMO_FALLOS_POR_EMAIL } from "../src/auth/limite";
import { hashearPassword, verificarPassword } from "../src/auth/password";
import { auditoria, intentoLogin, sesion, usuario } from "../src/db/schema";
import { conBase, crearDueno, EMAIL_DUENO, entrar, limpiarBase, PASSWORD_DUENO, pedir } from "./ayuda";

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
});

describe("contraseñas", () => {
  it("verifica la correcta y rechaza la incorrecta", async () => {
    const hash = await hashearPassword("otra frase de ejemplo");
    expect(hash).toMatch(/^pbkdf2-sha256\$20000\$/);
    expect((await verificarPassword("otra frase de ejemplo", hash)).valida).toBe(true);
    expect((await verificarPassword("otra frase de ejemplO", hash)).valida).toBe(false);
  });

  it("dos hashes de la misma contraseña son distintos (sal al azar)", async () => {
    expect(await hashearPassword("x".repeat(12))).not.toBe(await hashearPassword("x".repeat(12)));
  });

  it("pide rehashear los hashes con menos iteraciones", async () => {
    const viejo = await hashearPassword("otra frase de ejemplo", 1_000);
    expect(await verificarPassword("otra frase de ejemplo", viejo)).toEqual({ valida: true, rehashear: true });
  });

  it("Workers no acepta más de 100.000 iteraciones", async () => {
    await expect(hashearPassword("x", 100_001)).rejects.toThrow(/fuera de rango/);
  });

  it("un hash con formato roto no valida", async () => {
    expect((await verificarPassword("x", "basura")).valida).toBe(false);
    expect((await verificarPassword("x", "pbkdf2-sha256$999999$AA==$AA==")).valida).toBe(false);
  });
});

describe("login", () => {
  it("entra con email y contraseña y deja una cookie segura", async () => {
    const r = await pedir("/auth/login", {
      metodo: "POST",
      cuerpo: { email: " Dueno@Ejemplo.UY ", password: PASSWORD_DUENO },
    });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.usuario).toMatchObject({ email: EMAIL_DUENO, rol: "dueno" });
    expect(r.setCookie).toMatch(/^sesion=[0-9a-f]{64};/);
    expect(r.setCookie).toMatch(/HttpOnly/);
    expect(r.setCookie).toMatch(/Secure/);
    expect(r.setCookie).toMatch(/SameSite=Strict/);
  });

  it("guarda solo el hash del token, no el token", async () => {
    const cookie = await entrar();
    const token = cookie.split("=")[1]!;
    const filas = await conBase((db) => db.select().from(sesion));
    expect(filas).toHaveLength(1);
    expect(filas[0]!.id_hash).not.toBe(token);
    expect(filas[0]!.id_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("con la cookie se sabe quién es; sin cookie, 401", async () => {
    const cookie = await entrar();
    expect((await pedir("/auth/yo", { cookie })).cuerpo.usuario.email).toBe(EMAIL_DUENO);
    expect((await pedir("/auth/yo")).estado).toBe(401);
    expect((await pedir("/auth/yo", { cookie: "sesion=" + "0".repeat(64) })).estado).toBe(401);
    expect((await pedir("/auth/yo", { cookie: "sesion=no-es-hex" })).estado).toBe(401);
  });

  it("contraseña mala y email inexistente dan el mismo mensaje", async () => {
    const mala = await pedir("/auth/login", { metodo: "POST", cuerpo: { email: EMAIL_DUENO, password: "mala" } });
    const otro = await pedir("/auth/login", { metodo: "POST", cuerpo: { email: "nadie@ejemplo.uy", password: "mala" } });
    expect(mala.estado).toBe(401);
    expect(otro.estado).toBe(401);
    expect(mala.cuerpo.error).toBe(otro.cuerpo.error);
    expect(mala.setCookie).toBeNull();
  });

  it(`bloquea después de ${MAXIMO_FALLOS_POR_EMAIL} fallos, aunque después pongan la correcta`, async () => {
    for (let i = 0; i < MAXIMO_FALLOS_POR_EMAIL; i++) {
      const r = await pedir("/auth/login", { metodo: "POST", cuerpo: { email: EMAIL_DUENO, password: "mala" } });
      expect(r.estado).toBe(401);
    }
    const bloqueado = await pedir("/auth/login", {
      metodo: "POST",
      cuerpo: { email: EMAIL_DUENO, password: PASSWORD_DUENO },
    });
    expect(bloqueado.estado).toBe(429);
    expect(bloqueado.cuerpo.error).toMatch(/15 minutos/);
  });

  it("los fallos viejos dejan de contar", async () => {
    await conBase(async (db) => {
      const hace20Min = new Date(Date.now() - 20 * 60 * 1000);
      await db.insert(intentoLogin).values(
        Array.from({ length: MAXIMO_FALLOS_POR_EMAIL }, () => ({ email: EMAIL_DUENO, ip: "local", exito: false, fecha: hace20Min })),
      );
    });
    expect(await entrar()).toMatch(/^sesion=/);
  });

  it("un usuario desactivado no entra", async () => {
    await conBase((db) => db.update(usuario).set({ activo: false }).where(eq(usuario.email, EMAIL_DUENO)));
    const r = await pedir("/auth/login", { metodo: "POST", cuerpo: { email: EMAIL_DUENO, password: PASSWORD_DUENO } });
    expect(r.estado).toBe(401);
  });

  it("rehashea en el login si el hash tiene menos iteraciones", async () => {
    await conBase(async (db) =>
      db.update(usuario).set({ hash_password: await hashearPassword(PASSWORD_DUENO, 1_000) }),
    );
    await entrar();
    const [fila] = await conBase((db) => db.select().from(usuario));
    expect(fila!.hash_password).toMatch(/^pbkdf2-sha256\$20000\$/);
  });

  it("rechaza pedidos que no son JSON (defensa CSRF)", async () => {
    const r = await pedir("/auth/login", {
      metodo: "POST",
      cuerpo: { email: EMAIL_DUENO, password: PASSWORD_DUENO },
      cabeceras: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(r.estado).toBe(400);
  });

  it("registra entrada y salida en la auditoría", async () => {
    const cookie = await entrar();
    const salida = await pedir("/auth/logout", { metodo: "POST", cuerpo: {}, cookie });
    expect(salida.estado).toBe(200);
    expect((await pedir("/auth/yo", { cookie })).estado).toBe(401);
    const acciones = await conBase((db) => db.select({ accion: auditoria.accion }).from(auditoria).orderBy(auditoria.id));
    expect(acciones.map((a) => a.accion)).toEqual(["login", "logout"]);
  });
});

describe("cambio de contraseña", () => {
  it("cambia, cierra las otras sesiones y deja auditoría sin el hash", async () => {
    const otra = await entrar();
    const esta = await entrar();
    const nueva = "la nueva frase del dueño";
    const r = await pedir("/auth/password", { metodo: "POST", cuerpo: { actual: PASSWORD_DUENO, nueva }, cookie: esta });
    expect(r.estado).toBe(200);
    expect((await pedir("/auth/yo", { cookie: esta })).estado).toBe(200);
    expect((await pedir("/auth/yo", { cookie: otra })).estado).toBe(401);
    expect(await entrar(nueva)).toMatch(/^sesion=/);

    const [registro] = await conBase((db) =>
      db.select().from(auditoria).where(eq(auditoria.accion, "cambiar_password")),
    );
    expect(registro).toMatchObject({ antes: null, despues: null });
  });

  it("pide la contraseña actual y una nueva larga", async () => {
    const cookie = await entrar();
    const mal = await pedir("/auth/password", { metodo: "POST", cuerpo: { actual: "mala", nueva: "x".repeat(20) }, cookie });
    expect(mal.estado).toBe(400);
    const corta = await pedir("/auth/password", { metodo: "POST", cuerpo: { actual: PASSWORD_DUENO, nueva: "corta" }, cookie });
    expect(corta.estado).toBe(400);
    expect(corta.cuerpo.error).toMatch(/12 caracteres/);
  });
});
