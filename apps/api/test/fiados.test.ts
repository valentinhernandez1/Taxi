/**
 * Casos de prueba obligatorios de la especificación (§9) para fiados y cobros,
 * de punta a punta: pedido HTTP → servicio → Postgres → vistas de saldo.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditoria, cobro, movimiento, viaje } from "../src/db/schema";
import { hoy } from "../src/servicios/comun";
import { conBase, crearDueno, entrar, limpiarBase, pedir } from "./ayuda";

let cookie: string;
let opSeq = 0;
const op = () => `prueba-op-${++opSeq}-${Date.now()}`;
const $ = (pesos: number) => Math.round(pesos * 100);

beforeEach(async () => {
  await limpiarBase();
  await crearDueno();
  cookie = await entrar();
});

async function nuevoCliente(nombre = "Cliente Rodríguez (ejemplo)", extra: Record<string, unknown> = {}) {
  const r = await pedir("/clientes", { metodo: "POST", cuerpo: { nombre, ...extra }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.cliente.id as number;
}

async function nuevaPersona(nombre: string, tipo = "chofer") {
  const r = await pedir("/personas", { metodo: "POST", cuerpo: { nombre, tipo }, cookie });
  expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.persona.id as number;
}

function fiado(cliente_id: number, importe: number, fecha = "2026-10-12", extra: Record<string, unknown> = {}) {
  return pedir("/fiados", { metodo: "POST", cuerpo: { op_key: op(), cliente_id, fecha, importe, ...extra }, cookie });
}

function cobrar(cliente_id: number, importe: number, extra: Record<string, unknown> = {}) {
  return pedir("/cobros", {
    metodo: "POST",
    cuerpo: { op_key: op(), cliente_id, fecha: "2026-10-20", importe, medio: "efectivo", ...extra },
    cookie,
  });
}

async function ficha(id: number) {
  const r = await pedir(`/clientes/${id}`, { cookie });
  expect(r.estado).toBe(200);
  return r.cuerpo;
}

/** Saldo de cada cuenta = lo que entró − lo que salió (nunca una columna). */
async function saldosDeCuentas() {
  const filas = await conBase((db) =>
    db.execute<{ tipo: string; persona_id: string | null; saldo: string }>(sql`
      select c.tipo, c.persona_id::text,
             coalesce(sum(case when m.cuenta_hacia = c.id then m.importe else -m.importe end), 0)::numeric(12,2)::text as saldo
      from cuenta c left join movimiento m on m.cuenta_hacia = c.id or m.cuenta_desde = c.id
      group by c.id order by c.id`),
  );
  return Object.fromEntries(filas.map((f) => [f.persona_id ? `${f.tipo}:${f.persona_id}` : f.tipo, f.saldo]));
}

describe("caso 1 — un fiado no es plata cobrada", () => {
  it("fiado de $ 1.000: debe 1.000, no hay cobro ni movimiento de plata", async () => {
    const id = await nuevoCliente();
    const r = await fiado(id, $(1000));
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cliente).toMatchObject({ debe: $(1000), a_favor: 0 });
    expect(await conBase((db) => db.select().from(cobro))).toHaveLength(0);
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(0);
    const [v] = await conBase((db) => db.select().from(viaje));
    expect(v).toMatchObject({ forma_pago: "fiado", origen: "normal", importe: "1000.00" });
  });
});

describe("caso 2 — pago parcial", () => {
  it("debe 1.000, paga 400: saldo 600, el viaje sigue en 1.000 y entran 400", async () => {
    const id = await nuevoCliente();
    await fiado(id, $(1000));
    const r = await cobrar(id, $(400));
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cliente.debe).toBe($(600));
    expect(r.cuerpo.aplicado).toEqual([expect.objectContaining({ importe: $(400) })]);
    const { historial } = await ficha(id);
    const viajeFiado = historial.find((h: { tipo: string }) => h.tipo === "fiado");
    expect(viajeFiado).toMatchObject({ importe: $(1000), pagado: $(400), pendiente: $(600) });
    expect((await saldosDeCuentas()).caja).toBe("400.00");
  });
});

describe("caso 3 — FIFO", () => {
  it("lunes 500 y miércoles 300; paga 600: lunes saldado, miércoles 200, antigüedad desde el miércoles", async () => {
    const id = await nuevoCliente();
    const miercoles = await fiado(id, $(300), "2026-10-14");
    const lunes = await fiado(id, $(500), "2026-10-12");
    const r = await cobrar(id, $(600));
    expect(r.cuerpo.aplicado).toEqual([
      { viaje_id: lunes.cuerpo.viaje_id, fecha: "2026-10-12", importe: $(500) },
      { viaje_id: miercoles.cuerpo.viaje_id, fecha: "2026-10-14", importe: $(100) },
    ]);
    const { cliente, historial } = await ficha(id);
    expect(cliente.debe).toBe($(200));
    const pendientes = historial.filter((h: { tipo: string }) => h.tipo === "fiado").map((h: { fecha: string; pendiente: number }) => [h.fecha, h.pendiente]);
    expect(pendientes).toEqual([
      ["2026-10-14", $(200)],
      ["2026-10-12", 0],
    ]);
    const [s] = await conBase((db) => db.execute<{ desde: string }>(sql`select mas_viejo_pendiente::text as desde from saldo_cliente where cliente_id = ${id}`));
    expect(s!.desde).toBe("2026-10-14");
  });
});

describe("caso 4 — pago mayor que la deuda", () => {
  it("debe 200, paga 300: se rechaza y pide confirmación; confirmado quedan 100 a favor", async () => {
    const id = await nuevoCliente();
    await fiado(id, $(200));
    const opKey = op();
    const cuerpo = { op_key: opKey, cliente_id: id, fecha: "2026-10-20", importe: $(300), medio: "efectivo" };
    const rechazo = await pedir("/cobros", { metodo: "POST", cuerpo, cookie });
    expect(rechazo.estado).toBe(409);
    expect(rechazo.cuerpo).toMatchObject({ confirmar: "a_favor", debe: $(200), sobrante: $(100) });
    expect(rechazo.cuerpo.error).toMatch(/más de lo que debe/);
    expect(await conBase((db) => db.select().from(cobro))).toHaveLength(0);

    const ok = await pedir("/cobros", { metodo: "POST", cuerpo: { ...cuerpo, confirmar_a_favor: true }, cookie });
    expect(ok.estado).toBe(201);
    expect(ok.cuerpo.cliente).toMatchObject({ debe: 0, a_favor: $(100) });
  });

  it("el saldo a favor se usa en el próximo fiado", async () => {
    const id = await nuevoCliente();
    await cobrar(id, $(100), { confirmar_a_favor: true });
    const r = await fiado(id, $(300));
    expect(r.cuerpo.cliente).toMatchObject({ debe: $(200), a_favor: 0 });
  });
});

describe("caso 5 — doble envío", () => {
  it("el mismo cobro mandado dos veces queda una sola vez", async () => {
    const id = await nuevoCliente();
    await fiado(id, $(1000));
    const cuerpo = { op_key: op(), cliente_id: id, fecha: "2026-10-20", importe: $(400), medio: "efectivo" };
    const primero = await pedir("/cobros", { metodo: "POST", cuerpo, cookie });
    const segundo = await pedir("/cobros", { metodo: "POST", cuerpo, cookie });
    expect(primero.estado).toBe(201);
    expect(segundo.estado).toBe(200);
    expect(segundo.cuerpo.repetido).toBe(true);
    expect(segundo.cuerpo.cobro_id).toBe(primero.cuerpo.cobro_id);
    expect(await conBase((db) => db.select().from(cobro))).toHaveLength(1);
    expect((await ficha(id)).cliente.debe).toBe($(600));
  });

  it("también si los dos llegan a la vez", async () => {
    const id = await nuevoCliente();
    await fiado(id, $(1000));
    const cuerpo = { op_key: op(), cliente_id: id, fecha: "2026-10-20", importe: $(400), medio: "efectivo" };
    const [a, b] = await Promise.all([
      pedir("/cobros", { metodo: "POST", cuerpo, cookie }),
      pedir("/cobros", { metodo: "POST", cuerpo, cookie }),
    ]);
    expect([a.estado, b.estado].sort()).toEqual([200, 201]);
    expect(await conBase((db) => db.select().from(cobro))).toHaveLength(1);
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(1);
  });

  it("y con los fiados igual", async () => {
    const id = await nuevoCliente();
    const cuerpo = { op_key: op(), cliente_id: id, fecha: "2026-10-12", importe: $(500) };
    await pedir("/fiados", { metodo: "POST", cuerpo, cookie });
    await pedir("/fiados", { metodo: "POST", cuerpo, cookie });
    expect((await ficha(id)).cliente.debe).toBe($(500));
  });
});

describe("caso 6 — importes inválidos", () => {
  it.each([
    ["cero", 0],
    ["negativo", -5000],
    ["más de 2 decimales (1055,5 centésimos)", 1055.5],
  ])("%s se rechaza en fiados y cobros", async (_nombre, importe) => {
    const id = await nuevoCliente();
    expect((await fiado(id, importe)).estado).toBe(400);
    await fiado(id, $(1000));
    expect((await cobrar(id, importe)).estado).toBe(400);
    expect((await ficha(id)).cliente.debe).toBe($(1000));
  });
});

describe("caso 7 — un chofer cobra un fiado", () => {
  it("Juan recibe 600 en efectivo: la deuda baja 600, Juan tiene que entregar 600, la caja no cambia", async () => {
    const id = await nuevoCliente();
    const juan = await nuevaPersona("Juan (ejemplo)");
    await fiado(id, $(1000));
    const r = await cobrar(id, $(600), { recibido_por_id: juan });
    expect(r.cuerpo.cliente.debe).toBe($(400));
    const saldos = await saldosDeCuentas();
    expect(saldos[`a_entregar:${juan}`]).toBe("600.00");
    expect(saldos.caja).toBe("0.00");
    expect(saldos.externo).toBe("-600.00");
  });

  it("una transferencia va al banco", async () => {
    const id = await nuevoCliente();
    await fiado(id, $(1000));
    await cobrar(id, $(250), { medio: "transferencia" });
    expect((await saldosDeCuentas()).banco).toBe("250.00");
  });

  it("una transferencia no la puede recibir una persona", async () => {
    const id = await nuevoCliente();
    const juan = await nuevaPersona("Juan (ejemplo)");
    await fiado(id, $(1000));
    expect((await cobrar(id, $(250), { medio: "transferencia", recibido_por_id: juan })).estado).toBe(400);
  });
});

describe("caso 14 — anulación", () => {
  it("anular el cobro del caso 2: el saldo vuelve a 1.000, el cobro queda visible como anulado y con auditoría", async () => {
    const id = await nuevoCliente();
    const juan = await nuevaPersona("Juan (ejemplo)");
    await fiado(id, $(1000));
    const r = await cobrar(id, $(400), { recibido_por_id: juan });

    expect((await pedir(`/cobros/${r.cuerpo.cobro_id}/anular`, { metodo: "POST", cuerpo: {}, cookie })).estado).toBe(400);
    const anulado = await pedir(`/cobros/${r.cuerpo.cobro_id}/anular`, {
      metodo: "POST",
      cuerpo: { motivo: "Se anotó dos veces" },
      cookie,
    });
    expect(anulado.estado).toBe(200);

    const { cliente, historial } = await ficha(id);
    expect(cliente.debe).toBe($(1000));
    expect(historial.find((h: { tipo: string }) => h.tipo === "cobro")).toMatchObject({
      anulado: true,
      motivo_anulacion: "Se anotó dos veces",
      importe: $(400),
    });
    const saldos = await saldosDeCuentas();
    expect(saldos[`a_entregar:${juan}`]).toBe("0.00");
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(2); // original + inverso

    const registros = await conBase((db) => db.select().from(auditoria).where(sql`${auditoria.accion} = 'anular'`));
    expect(registros).toEqual([expect.objectContaining({ tabla: "cobro", motivo: "Se anotó dos veces" })]);
  });

  it("anular un fiado sin pagos lo saca de la deuda; con pagos aplicados no deja", async () => {
    const id = await nuevoCliente();
    const a = await fiado(id, $(300));
    const b = await fiado(id, $(500), "2026-10-13");
    await cobrar(id, $(100));
    const conPago = await pedir(`/fiados/${a.cuerpo.viaje_id}/anular`, { metodo: "POST", cuerpo: { motivo: "Error" }, cookie });
    expect(conPago.estado).toBe(400);
    expect(conPago.cuerpo.error).toMatch(/primero anulá esos cobros/);
    const sinPago = await pedir(`/fiados/${b.cuerpo.viaje_id}/anular`, { metodo: "POST", cuerpo: { motivo: "No era fiado" }, cookie });
    expect(sinPago.estado).toBe(200);
    expect((await ficha(id)).cliente.debe).toBe($(200));
  });
});

describe("caso 15 — carga inicial", () => {
  it("un fiado viejo de 700 suma a la deuda como carga inicial", async () => {
    const id = await nuevoCliente();
    const r = await pedir(`/clientes/${id}/carga-inicial`, {
      metodo: "POST",
      cuerpo: { op_key: op(), renglones: [{ fecha: "2026-08-07", importe: $(700) }], pagos: [], total_hoja: $(700) },
      cookie,
    });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cliente.debe).toBe($(700));
    const [v] = await conBase((db) => db.select().from(viaje));
    expect(v).toMatchObject({ origen: "carga_inicial", nota: "Chofer anterior" });
    expect(await conBase((db) => db.select().from(movimiento))).toHaveLength(0);
  });

  it("la hoja del prototipo: 800 + 600 + 400 con un pago de 500 da 1.300", async () => {
    const id = await nuevoCliente();
    const juan = await nuevaPersona("Juan (ejemplo)");
    const hoja = {
      op_key: op(),
      renglones: [
        { fecha: "2026-08-07", importe: $(800), chofer_id: juan },
        { fecha: "2026-08-22", importe: $(600) },
        { fecha: "2026-10-03", importe: $(400), chofer_id: juan },
      ],
      pagos: [{ fecha: "2026-09-10", importe: $(500) }],
      total_hoja: $(1300),
    };
    const r = await pedir(`/clientes/${id}/carga-inicial`, { metodo: "POST", cuerpo: hoja, cookie });
    expect(r.estado).toBe(201);
    expect(r.cuerpo.cliente.debe).toBe($(1300));
    const { historial } = await ficha(id);
    const pendientes = historial.filter((h: { tipo: string }) => h.tipo === "fiado").map((h: { pendiente: number }) => h.pendiente);
    expect(pendientes).toEqual([$(400), $(600), $(300)]); // el pago fue al viaje más viejo
    // Mandarla de nuevo no duplica.
    expect((await pedir(`/clientes/${id}/carga-inicial`, { metodo: "POST", cuerpo: hoja, cookie })).cuerpo.repetido).toBe(true);
    expect((await ficha(id)).cliente.debe).toBe($(1300));
  });

  it("si no coincide con el total de la hoja, no guarda nada y dice la diferencia", async () => {
    const id = await nuevoCliente();
    const r = await pedir(`/clientes/${id}/carga-inicial`, {
      metodo: "POST",
      cuerpo: { op_key: op(), renglones: [{ fecha: "2026-08-07", importe: $(800) }], pagos: [{ fecha: "2026-08-10", importe: $(500) }], total_hoja: $(400) },
      cookie,
    });
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toMatch(/diferencia de \$ 100/);
    expect(await conBase((db) => db.select().from(viaje))).toHaveLength(0);
  });
});

describe("caso 20 — límite de fiado", () => {
  it("límite 2.000, debe 1.300, fiado 800: avisa antes de guardar; confirmado, se guarda", async () => {
    const id = await nuevoCliente("Cliente con límite (ejemplo)", { limite_fiado: $(2000) });
    await fiado(id, $(1300));
    const opKey = op();
    const aviso = await pedir("/fiados", { metodo: "POST", cuerpo: { op_key: opKey, cliente_id: id, fecha: "2026-10-13", importe: $(800) }, cookie });
    expect(aviso.estado).toBe(409);
    expect(aviso.cuerpo).toMatchObject({ confirmar: "limite", debe: $(1300), limite: $(2000), quedaria: $(2100) });
    expect((await ficha(id)).cliente.debe).toBe($(1300));

    const ok = await pedir("/fiados", {
      metodo: "POST",
      cuerpo: { op_key: opKey, cliente_id: id, fecha: "2026-10-13", importe: $(800), confirmar_limite: true },
      cookie,
    });
    expect(ok.estado).toBe(201);
    expect(ok.cuerpo.cliente.debe).toBe($(2100));
  });
});

describe("clientes", () => {
  it("Quién debe: solo los que deben, lo más viejo arriba, con color y total", async () => {
    const viejo = await nuevoCliente("Cliente viejo (ejemplo)");
    const nuevo = await nuevoCliente("Cliente nuevo (ejemplo)");
    await nuevoCliente("Cliente al día (ejemplo)");
    const dia = (hace: number) => new Date(Date.now() - hace * 86_400_000).toISOString().slice(0, 10);
    await fiado(nuevo, $(800), dia(5));
    await fiado(viejo, $(1300), dia(72));
    const r = await pedir("/clientes?deben=1", { cookie });
    expect(r.cuerpo.total_debe).toBe($(2100));
    expect(r.cuerpo.clientes.map((c: { id: number; nivel: string }) => [c.id, c.nivel])).toEqual([
      [viejo, "roja"],
      [nuevo, "normal"],
    ]);
  });

  it("busca por nombre sin importar mayúsculas", async () => {
    await nuevoCliente("Almacén La Esquina (ejemplo)");
    await nuevoCliente("Cliente Pérez (ejemplo)");
    const r = await pedir(`/clientes?buscar=${encodeURIComponent("esquina")}`, { cookie });
    expect(r.cuerpo.clientes.map((c: { nombre: string }) => c.nombre)).toEqual(["Almacén La Esquina (ejemplo)"]);
  });

  it("no repite nombres y no da de baja a quien debe", async () => {
    const id = await nuevoCliente();
    expect((await pedir("/clientes", { metodo: "POST", cuerpo: { nombre: "cliente rodríguez (EJEMPLO)" }, cookie })).estado).toBe(409);
    await fiado(id, $(100));
    const baja = await pedir(`/clientes/${id}`, { metodo: "PUT", cuerpo: { activo: false }, cookie });
    expect(baja.estado).toBe(400);
  });

  it("editar deja auditoría con antes, después y motivo", async () => {
    const id = await nuevoCliente();
    const r = await pedir(`/clientes/${id}`, { metodo: "PUT", cuerpo: { telefono: "099 123 456", motivo: "Me lo pasó" }, cookie });
    expect(r.estado).toBe(200);
    const [registro] = await conBase((db) => db.select().from(auditoria).where(sql`${auditoria.accion} = 'modificar'`));
    expect(registro).toMatchObject({ antes: { telefono: null }, despues: { telefono: "099 123 456" }, motivo: "Me lo pasó" });
  });

  it("recordatorio por WhatsApp: arma el enlace y anota la fecha", async () => {
    const id = await nuevoCliente("Rodríguez", { telefono: "099 123 456" });
    expect((await pedir(`/clientes/${id}/recordatorio`, { metodo: "POST", cuerpo: {}, cookie })).estado).toBe(400); // no debe nada
    await fiado(id, $(1300));
    const r = await pedir(`/clientes/${id}/recordatorio`, { metodo: "POST", cuerpo: {}, cookie });
    expect(r.estado).toBe(200);
    expect(r.cuerpo.enlace).toMatch(/^https:\/\/wa\.me\/59899123456\?text=/);
    expect(r.cuerpo.mensaje).toContain("$ 1.300");
    expect((await ficha(id)).cliente.ultimo_recordatorio).not.toBeNull();
  });

  it("no se anota un día que todavía no llegó", async () => {
    const id = await nuevoCliente();
    const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const r = await fiado(id, $(100), manana);
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toMatch(/todavía no llegó/);
    expect((await fiado(id, $(100), hoy())).estado).toBe(201);
  });
});
