/**
 * Modelo de datos (docs/especificacion.md §5). Postgres estándar, sin extensiones,
 * para poder mudarse de Neon sin reescribir.
 *
 * - Dinero: NUMERIC(12,2), leído como texto y convertido a centésimos con
 *   `desdeNumeric` de @taxis/shared. Nunca float.
 * - Fechas de negocio: `date` (día en America/Montevideo). Instantes: timestamptz.
 * - Saldos: no hay columnas de saldo; salen de `movimiento` (vistas en etapas siguientes).
 * - Nada confirmado se borra: `anulado` + `auditoria`. Por eso las FK no tienen cascade.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const dinero = (nombre: string) => numeric(nombre, { precision: 12, scale: 2 });
const instante = (nombre: string) => timestamp(nombre, { withTimezone: true, mode: "date" });
const dia = (nombre: string) => date(nombre, { mode: "string" });
const creadoEn = () => instante("creado_en").notNull().defaultNow();
const anulacion = {
  anulado: boolean("anulado").notNull().default(false),
  anulado_en: instante("anulado_en"),
  motivo_anulacion: text("motivo_anulacion"),
};
/** Clave idempotente generada por el cliente (regla 8). */
const opKey = () => text("op_key").notNull();

// ---------------------------------------------------------------- Enumerados

export const rolUsuario = pgEnum("rol_usuario", ["dueno", "telefonista", "chofer"]);
export const tipoPersona = pgEnum("tipo_persona", ["dueno", "chofer", "telefonista", "otro"]);
export const formaPago = pgEnum("forma_pago", ["efectivo", "tarjeta", "fiado"]);
export const origenViaje = pgEnum("origen_viaje", ["normal", "carga_inicial"]);
export const medioCobro = pgEnum("medio_cobro", ["efectivo", "transferencia"]);
/** carga_inicial: pagos anotados en las hojas de papel; no mueven plata de hoy. */
export const origenCobro = pgEnum("origen_cobro", ["normal", "carga_inicial"]);
export const tipoCuenta = pgEnum("tipo_cuenta", ["caja", "banco", "handy", "a_entregar", "externo"]);
export const estadoGasto = pgEnum("estado_gasto", ["pendiente", "pagado"]);
export const frecuenciaGasto = pgEnum("frecuencia_gasto", [
  "mensual",
  "bimestral",
  "anual",
  "meses_especificos",
]);
export const estadoVencimiento = pgEnum("estado_vencimiento", ["pendiente", "pagado", "omitido"]);
export const conceptoPagoEmpleado = pgEnum("concepto_pago_empleado", [
  "sueldo",
  "jornal",
  "adelanto",
  "aguinaldo",
  "salario_vacacional",
]);
export const tipoLiquidacion = pgEnum("tipo_liquidacion", ["porcentaje", "jornal", "sueldo", "mixto"]);
export const modoEntrega = pgEnum("modo_entrega", ["entrega_todo", "se_queda_su_parte"]);
/** A: se le paga su parte del fiado en la liquidación. B: cuando el cliente paga. */
export const momentoFiado = pgEnum("momento_fiado", ["A", "B"]);
export const incobrable = pgEnum("incobrable", ["empresa", "chofer"]);
export const estadoLiquidacion = pgEnum("estado_liquidacion", ["confirmada", "anulada"]);
export const estadoSugerencia = pgEnum("estado_sugerencia", ["hecha", "descartada"]);
export const accionAuditoria = pgEnum("accion_auditoria", [
  "crear",
  "modificar",
  "anular",
  "login",
  "logout",
  "cambiar_password",
]);

// ---------------------------------------------------------------- Personas y acceso

export const usuario = pgTable(
  "usuario",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    hash_password: text("hash_password").notNull(),
    rol: rolUsuario("rol").notNull().default("dueno"),
    persona_id: bigint("persona_id", { mode: "number" }).references(() => persona.id),
    activo: boolean("activo").notNull().default(true),
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("usuario_email_unico").on(sql`lower(${t.email})`)],
);

export const sesion = pgTable(
  "sesion",
  {
    /** SHA-256 del token de la cookie; el token en claro nunca se guarda. */
    id_hash: text("id_hash").primaryKey(),
    usuario_id: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuario.id),
    creada_en: creadoEn(),
    expira_en: instante("expira_en").notNull(),
    ultimo_uso: instante("ultimo_uso").notNull().defaultNow(),
  },
  (t) => [index("sesion_usuario").on(t.usuario_id)],
);

/** Para limitar intentos de login por email y por IP. */
export const intentoLogin = pgTable(
  "intento_login",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: text("ip").notNull(),
    exito: boolean("exito").notNull(),
    fecha: creadoEn(),
  },
  (t) => [index("intento_login_email_fecha").on(t.email, t.fecha), index("intento_login_ip_fecha").on(t.ip, t.fecha)],
);

export const persona = pgTable("persona", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  tipo: tipoPersona("tipo").notNull(),
  activo: boolean("activo").notNull().default(true),
  creado_en: creadoEn(),
});

export const coche = pgTable(
  "coche",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    nombre_movil: text("nombre_movil").notNull(),
    matricula: text("matricula"),
    activo: boolean("activo").notNull().default(true),
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("coche_matricula_unica").on(t.matricula)],
);

export const cliente = pgTable(
  "cliente",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    observaciones: text("observaciones"),
    plazo_dias: integer("plazo_dias"),
    limite_fiado: dinero("limite_fiado"),
    ultimo_recordatorio: instante("ultimo_recordatorio"),
    activo: boolean("activo").notNull().default(true),
    creado_en: creadoEn(),
  },
  (t) => [
    index("cliente_nombre").on(sql`lower(${t.nombre})`),
    check("cliente_plazo_positivo", sql`${t.plazo_dias} is null or ${t.plazo_dias} > 0`),
    check("cliente_limite_positivo", sql`${t.limite_fiado} is null or ${t.limite_fiado} > 0`),
  ],
);

// ---------------------------------------------------------------- Turnos

export const plantillaTurno = pgTable("plantilla_turno", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  nombre: text("nombre").notNull(),
  hora_inicio: time("hora_inicio").notNull(),
  hora_fin: time("hora_fin").notNull(),
  color: text("color"),
  activa: boolean("activa").notNull().default(true),
});

export const turno = pgTable(
  "turno",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fecha: dia("fecha").notNull(),
    coche_id: bigint("coche_id", { mode: "number" })
      .notNull()
      .references(() => coche.id),
    chofer_id: bigint("chofer_id", { mode: "number" }).references(() => persona.id),
    plantilla_id: bigint("plantilla_id", { mode: "number" })
      .notNull()
      .references(() => plantillaTurno.id),
    sustituye_a_id: bigint("sustituye_a_id", { mode: "number" }).references(() => persona.id),
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("turno_unico").on(t.fecha, t.coche_id, t.plantilla_id),
    index("turno_chofer_fecha").on(t.chofer_id, t.fecha),
  ],
);

// ---------------------------------------------------------------- Viajes, cobros y plata

export const viaje = pgTable(
  "viaje",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fecha: dia("fecha").notNull(),
    importe: dinero("importe").notNull(),
    forma_pago: formaPago("forma_pago").notNull(),
    chofer_id: bigint("chofer_id", { mode: "number" }).references(() => persona.id),
    coche_id: bigint("coche_id", { mode: "number" }).references(() => coche.id),
    turno_id: bigint("turno_id", { mode: "number" }).references(() => turno.id),
    cliente_id: bigint("cliente_id", { mode: "number" }).references(() => cliente.id),
    recibido_por_id: bigint("recibido_por_id", { mode: "number" }).references(() => persona.id),
    /** Liquidación del turno en que entró este viaje (nulo = todavía sin liquidar). */
    liquidacion_id: bigint("liquidacion_id", { mode: "number" }).references((): AnyPgColumn => liquidacion.id),
    /** Regla B: liquidación en que se le pagó al chofer su parte de este fiado, cuando el cliente pagó. */
    parte_fiado_liquidacion_id: bigint("parte_fiado_liquidacion_id", { mode: "number" }).references((): AnyPgColumn => liquidacion.id),
    origen: origenViaje("origen").notNull().default("normal"),
    /** Para carga inicial: "Chofer anterior" u otra nota de la hoja de papel. */
    nota: text("nota"),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("viaje_op_key").on(t.op_key),
    index("viaje_fecha").on(t.fecha),
    index("viaje_cliente").on(t.cliente_id),
    index("viaje_chofer_sin_liquidar").on(t.chofer_id).where(sql`${t.liquidacion_id} is null`),
    check("viaje_importe_positivo", sql`${t.importe} > 0`),
    check("viaje_fiado_con_cliente", sql`${t.forma_pago} <> 'fiado' or ${t.cliente_id} is not null`),
  ],
);

export const cobro = pgTable(
  "cobro",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cliente_id: bigint("cliente_id", { mode: "number" })
      .notNull()
      .references(() => cliente.id),
    fecha: dia("fecha").notNull(),
    importe: dinero("importe").notNull(),
    /** Nulo solo en la carga inicial (pagos viejos de la hoja de papel). */
    medio: medioCobro("medio"),
    /** Quién recibió el efectivo; nulo = el dueño (va a la caja). */
    recibido_por_id: bigint("recibido_por_id", { mode: "number" }).references(() => persona.id),
    origen: origenCobro("origen").notNull().default("normal"),
    nota: text("nota"),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("cobro_op_key").on(t.op_key),
    index("cobro_cliente").on(t.cliente_id),
    check("cobro_importe_positivo", sql`${t.importe} > 0`),
    check("cobro_medio", sql`${t.origen} = 'carga_inicial' or ${t.medio} is not null`),
  ],
);

export const imputacion = pgTable(
  "imputacion",
  {
    cobro_id: bigint("cobro_id", { mode: "number" })
      .notNull()
      .references(() => cobro.id),
    viaje_id: bigint("viaje_id", { mode: "number" })
      .notNull()
      .references(() => viaje.id),
    importe: dinero("importe").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cobro_id, t.viaje_id] }),
    index("imputacion_viaje").on(t.viaje_id),
    check("imputacion_importe_positivo", sql`${t.importe} > 0`),
  ],
);

export const cuenta = pgTable(
  "cuenta",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tipo: tipoCuenta("tipo").notNull(),
    persona_id: bigint("persona_id", { mode: "number" }).references(() => persona.id),
    nombre: text("nombre").notNull(),
    activa: boolean("activa").notNull().default(true),
  },
  (t) => [
    uniqueIndex("cuenta_por_persona").on(t.tipo, t.persona_id),
    // Una sola caja, un banco, un Handy y un "afuera" (las de persona van aparte).
    uniqueIndex("cuenta_base_unica").on(t.tipo).where(sql`${t.persona_id} is null`),
    check(
      "cuenta_a_entregar_con_persona",
      sql`(${t.tipo} = 'a_entregar') = (${t.persona_id} is not null)`,
    ),
  ],
);

export const movimiento = pgTable(
  "movimiento",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fecha: dia("fecha").notNull(),
    importe: dinero("importe").notNull(),
    cuenta_desde: bigint("cuenta_desde", { mode: "number" })
      .notNull()
      .references(() => cuenta.id),
    cuenta_hacia: bigint("cuenta_hacia", { mode: "number" })
      .notNull()
      .references(() => cuenta.id),
    tipo: text("tipo").notNull(),
    origen_tabla: text("origen_tabla").notNull(),
    origen_id: bigint("origen_id", { mode: "number" }).notNull(),
    /** Movimiento que este revierte, si es una anulación. */
    revierte_id: bigint("revierte_id", { mode: "number" }),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("movimiento_op_key").on(t.op_key),
    index("movimiento_desde").on(t.cuenta_desde),
    index("movimiento_hacia").on(t.cuenta_hacia),
    index("movimiento_origen").on(t.origen_tabla, t.origen_id),
    check("movimiento_importe_positivo", sql`${t.importe} > 0`),
    check("movimiento_cuentas_distintas", sql`${t.cuenta_desde} <> ${t.cuenta_hacia}`),
  ],
);

export const entrega = pgTable(
  "entrega",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    persona_id: bigint("persona_id", { mode: "number" })
      .notNull()
      .references(() => persona.id),
    fecha: dia("fecha").notNull(),
    esperado: dinero("esperado").notNull(),
    entregado: dinero("entregado").notNull(),
    diferencia: dinero("diferencia").notNull(),
    nota: text("nota"),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("entrega_op_key").on(t.op_key),
    check("entrega_diferencia", sql`${t.diferencia} = ${t.esperado} - ${t.entregado}`),
  ],
);

export const acreditacionHandy = pgTable(
  "acreditacion_handy",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fecha: dia("fecha").notNull(),
    importe_esperado: dinero("importe_esperado").notNull(),
    importe_acreditado: dinero("importe_acreditado").notNull(),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("acreditacion_handy_op_key").on(t.op_key)],
);

/** Viajes con tarjeta incluidos en cada acreditación (el campo "viajes" de la especificación). */
export const acreditacionHandyViaje = pgTable(
  "acreditacion_handy_viaje",
  {
    acreditacion_id: bigint("acreditacion_id", { mode: "number" })
      .notNull()
      .references(() => acreditacionHandy.id),
    viaje_id: bigint("viaje_id", { mode: "number" })
      .notNull()
      .references(() => viaje.id),
  },
  (t) => [primaryKey({ columns: [t.acreditacion_id, t.viaje_id] })],
);

// ---------------------------------------------------------------- Gastos

export const categoriaGasto = pgTable(
  "categoria_gasto",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    nombre: text("nombre").notNull(),
    es_de_coche: boolean("es_de_coche").notNull().default(false),
    /** Cuota de compra de un coche: va aparte de los gastos de funcionamiento (regla 11). */
    es_cuota_vehiculo: boolean("es_cuota_vehiculo").notNull().default(false),
    activa: boolean("activa").notNull().default(true),
  },
  (t) => [uniqueIndex("categoria_gasto_nombre").on(sql`lower(${t.nombre})`)],
);

export const gastoFijo = pgTable(
  "gasto_fijo",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoria_id: bigint("categoria_id", { mode: "number" })
      .notNull()
      .references(() => categoriaGasto.id),
    coche_id: bigint("coche_id", { mode: "number" }).references(() => coche.id),
    descripcion: text("descripcion").notNull(),
    importe: dinero("importe"),
    frecuencia: frecuenciaGasto("frecuencia").notNull(),
    /** Meses (1-12) para frecuencia "meses_especificos". */
    meses: smallint("meses").array(),
    dia_del_mes: smallint("dia_del_mes").notNull(),
    /** Primer período que genera vencimiento, "AAAA-MM". */
    primer_periodo: text("primer_periodo").notNull(),
    importe_estimado: boolean("importe_estimado").notNull().default(false),
    cuotas_total: integer("cuotas_total"),
    fecha_fin: dia("fecha_fin"),
    es_cuota_vehiculo: boolean("es_cuota_vehiculo").notNull().default(false),
    dias_aviso: smallint("dias_aviso").array().notNull().default(sql`'{3,0}'`),
    activo: boolean("activo").notNull().default(true),
    creado_en: creadoEn(),
  },
  (t) => [
    check("gasto_fijo_dia", sql`${t.dia_del_mes} between 1 and 31`),
    check("gasto_fijo_primer_periodo", sql`${t.primer_periodo} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const gasto = pgTable(
  "gasto",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fecha: dia("fecha").notNull(),
    importe: dinero("importe").notNull(),
    categoria_id: bigint("categoria_id", { mode: "number" })
      .notNull()
      .references(() => categoriaGasto.id),
    coche_id: bigint("coche_id", { mode: "number" }).references(() => coche.id),
    descripcion: text("descripcion"),
    estado: estadoGasto("estado").notNull(),
    fecha_pago: dia("fecha_pago"),
    pagado_desde: bigint("pagado_desde", { mode: "number" }).references(() => cuenta.id),
    gasto_fijo_id: bigint("gasto_fijo_id", { mode: "number" }).references(() => gastoFijo.id),
    /** Gasto que pagó el chofer con la plata del turno, anotado en su liquidación. */
    liquidacion_id: bigint("liquidacion_id", { mode: "number" }).references((): AnyPgColumn => liquidacion.id),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("gasto_op_key").on(t.op_key),
    index("gasto_fecha").on(t.fecha),
    check("gasto_importe_positivo", sql`${t.importe} > 0`),
    check(
      "gasto_pagado_completo",
      sql`${t.estado} = 'pendiente' or (${t.fecha_pago} is not null and ${t.pagado_desde} is not null)`,
    ),
  ],
);

export const vencimiento = pgTable(
  "vencimiento",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    gasto_fijo_id: bigint("gasto_fijo_id", { mode: "number" })
      .notNull()
      .references(() => gastoFijo.id),
    /** Período al que corresponde, "AAAA-MM". */
    periodo: text("periodo").notNull(),
    fecha_vence: dia("fecha_vence").notNull(),
    importe_estimado: dinero("importe_estimado"),
    importe_real: dinero("importe_real"),
    estado: estadoVencimiento("estado").notNull().default("pendiente"),
    /** "Avisame mañana": no se muestra como aviso antes de este día. */
    avisar_desde: dia("avisar_desde"),
    gasto_id: bigint("gasto_id", { mode: "number" }).references(() => gasto.id),
  },
  (t) => [
    uniqueIndex("vencimiento_periodo").on(t.gasto_fijo_id, t.periodo),
    index("vencimiento_fecha").on(t.fecha_vence),
  ],
);

export const pagoEmpleado = pgTable(
  "pago_empleado",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    persona_id: bigint("persona_id", { mode: "number" })
      .notNull()
      .references(() => persona.id),
    concepto: conceptoPagoEmpleado("concepto").notNull(),
    periodo: text("periodo").notNull(),
    importe: dinero("importe").notNull(),
    fecha: dia("fecha").notNull(),
    pagado_desde: bigint("pagado_desde", { mode: "number" })
      .notNull()
      .references(() => cuenta.id),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("pago_empleado_op_key").on(t.op_key),
    check("pago_empleado_importe_positivo", sql`${t.importe} > 0`),
  ],
);

// ---------------------------------------------------------------- Liquidación

export const reglaLiquidacion = pgTable(
  "regla_liquidacion",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chofer_id: bigint("chofer_id", { mode: "number" })
      .notNull()
      .references(() => persona.id),
    tipo: tipoLiquidacion("tipo").notNull(),
    /** Centésimos de punto: 3000 = 30 %. */
    porcentaje_puntos: integer("porcentaje_puntos"),
    jornal: dinero("jornal"),
    modo_entrega: modoEntrega("modo_entrega").notNull(),
    momento_fiado: momentoFiado("momento_fiado").notNull(),
    incobrable: incobrable("incobrable").notNull().default("empresa"),
    /** Regla 12: queda "sin confirmar" hasta que el dueño la confirme. */
    confirmada: boolean("confirmada").notNull().default(false),
    vigente_desde: dia("vigente_desde").notNull(),
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("regla_liquidacion_vigencia").on(t.chofer_id, t.vigente_desde),
    check(
      "regla_liquidacion_porcentaje",
      sql`${t.porcentaje_puntos} is null or ${t.porcentaje_puntos} between 0 and 10000`,
    ),
  ],
);

export const liquidacion = pgTable(
  "liquidacion",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chofer_id: bigint("chofer_id", { mode: "number" })
      .notNull()
      .references(() => persona.id),
    turno_id: bigint("turno_id", { mode: "number" }).references(() => turno.id),
    regla_id: bigint("regla_id", { mode: "number" })
      .notNull()
      .references(() => reglaLiquidacion.id),
    fecha: dia("fecha").notNull(),
    facturado: dinero("facturado").notNull(),
    parte_chofer: dinero("parte_chofer").notNull(),
    adelantos_fiado: dinero("adelantos_fiado").notNull(),
    /** Regla B: parte de fiados viejos que ya se cobraron, pagada en esta liquidación. */
    parte_fiados_cobrados: dinero("parte_fiados_cobrados").notNull().default("0"),
    gastos: dinero("gastos").notNull(),
    esperado: dinero("esperado").notNull(),
    entregado: dinero("entregado").notNull(),
    diferencia: dinero("diferencia").notNull(),
    estado: estadoLiquidacion("estado").notNull().default("confirmada"),
    nota: text("nota"),
    anulado_en: instante("anulado_en"),
    motivo_anulacion: text("motivo_anulacion"),
    op_key: opKey(),
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("liquidacion_op_key").on(t.op_key), uniqueIndex("liquidacion_turno").on(t.turno_id)],
);

// ---------------------------------------------------------------- Panel y avisos

export const llamadaPerdida = pgTable("llamada_perdida", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fecha: dia("fecha").notNull(),
  hora: time("hora"),
  nota: text("nota"),
  creado_en: creadoEn(),
});

export const sugerenciaEstado = pgTable(
  "sugerencia_estado",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clave: text("clave").notNull(),
    periodo: text("periodo").notNull(),
    estado: estadoSugerencia("estado").notNull(),
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("sugerencia_estado_unica").on(t.clave, t.periodo)],
);

export const aviso = pgTable(
  "aviso",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tipo: text("tipo").notNull(),
    referencia: text("referencia").notNull(),
    fecha_aviso: dia("fecha_aviso").notNull(),
    enviado: boolean("enviado").notNull().default(false),
    posponer_hasta: dia("posponer_hasta"),
  },
  (t) => [uniqueIndex("aviso_unico").on(t.tipo, t.referencia, t.fecha_aviso)],
);

export const suscripcionPush = pgTable(
  "suscripcion_push",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    usuario_id: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuario.id),
    endpoint: text("endpoint").notNull(),
    claves: jsonb("claves").notNull(),
    creado_en: creadoEn(),
  },
  (t) => [uniqueIndex("suscripcion_push_endpoint").on(t.endpoint)],
);

// ---------------------------------------------------------------- Ajustes y auditoría

export const ajuste = pgTable("ajuste", {
  clave: text("clave").primaryKey(),
  valor: jsonb("valor").notNull(),
  actualizado_en: instante("actualizado_en").notNull().defaultNow(),
});

export const auditoria = pgTable(
  "auditoria",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tabla: text("tabla").notNull(),
    registro_id: text("registro_id").notNull(),
    accion: accionAuditoria("accion").notNull(),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    motivo: text("motivo"),
    usuario_id: bigint("usuario_id", { mode: "number" }).references(() => usuario.id),
    fecha: creadoEn(),
  },
  (t) => [
    index("auditoria_registro").on(t.tabla, t.registro_id),
    index("auditoria_fecha").on(t.fecha),
  ],
);

// ---------------------------------------------------------------- Comprobantes

/**
 * Fotos de comprobantes (transferencias, tickets de gastos). El archivo vive en
 * R2; acá queda de qué registro es. Nada se borra: se anula con motivo.
 */
export const comprobante = pgTable(
  "comprobante",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tabla: text("tabla").notNull(),
    registro_id: bigint("registro_id", { mode: "number" }).notNull(),
    /** Clave en R2 de la foto normalizada (máx. 1.600 px, sin datos ocultos). */
    clave: text("clave").notNull(),
    /** Clave en R2 de la miniatura; vacía si Images no estaba disponible al subir. */
    clave_miniatura: text("clave_miniatura"),
    tipo: text("tipo").notNull(),
    bytes: integer("bytes").notNull(),
    ancho: integer("ancho"),
    alto: integer("alto"),
    op_key: opKey(),
    ...anulacion,
    creado_en: creadoEn(),
  },
  (t) => [
    uniqueIndex("comprobante_op_key").on(t.op_key),
    uniqueIndex("comprobante_clave").on(t.clave),
    index("comprobante_registro").on(t.tabla, t.registro_id),
    check("comprobante_tabla", sql`${t.tabla} in ('cobro', 'gasto')`),
    check("comprobante_bytes", sql`${t.bytes} > 0`),
  ],
);

/** Días que el dueño marcó "no se trabajó": cuentan como cargados (regla 9). */
export const diaSinTrabajo = pgTable("dia_sin_trabajo", {
  fecha: dia("fecha").primaryKey(),
  nota: text("nota"),
  creado_en: creadoEn(),
});
