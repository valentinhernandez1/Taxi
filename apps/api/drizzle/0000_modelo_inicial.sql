CREATE TYPE "public"."accion_auditoria" AS ENUM('crear', 'modificar', 'anular', 'login', 'logout', 'cambiar_password');--> statement-breakpoint
CREATE TYPE "public"."concepto_pago_empleado" AS ENUM('sueldo', 'jornal', 'adelanto', 'aguinaldo', 'salario_vacacional');--> statement-breakpoint
CREATE TYPE "public"."estado_gasto" AS ENUM('pendiente', 'pagado');--> statement-breakpoint
CREATE TYPE "public"."estado_liquidacion" AS ENUM('confirmada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."estado_sugerencia" AS ENUM('hecha', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."estado_vencimiento" AS ENUM('pendiente', 'pagado', 'omitido');--> statement-breakpoint
CREATE TYPE "public"."forma_pago" AS ENUM('efectivo', 'tarjeta', 'fiado');--> statement-breakpoint
CREATE TYPE "public"."frecuencia_gasto" AS ENUM('mensual', 'bimestral', 'anual', 'meses_especificos');--> statement-breakpoint
CREATE TYPE "public"."incobrable" AS ENUM('empresa', 'chofer');--> statement-breakpoint
CREATE TYPE "public"."medio_cobro" AS ENUM('efectivo', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."modo_entrega" AS ENUM('entrega_todo', 'se_queda_su_parte');--> statement-breakpoint
CREATE TYPE "public"."momento_fiado" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."origen_viaje" AS ENUM('normal', 'carga_inicial');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('dueno', 'telefonista', 'chofer');--> statement-breakpoint
CREATE TYPE "public"."tipo_cuenta" AS ENUM('caja', 'banco', 'handy', 'a_entregar', 'externo');--> statement-breakpoint
CREATE TYPE "public"."tipo_liquidacion" AS ENUM('porcentaje', 'jornal', 'sueldo', 'mixto');--> statement-breakpoint
CREATE TYPE "public"."tipo_persona" AS ENUM('dueno', 'chofer', 'telefonista', 'otro');--> statement-breakpoint
CREATE TABLE "acreditacion_handy" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"importe_esperado" numeric(12, 2) NOT NULL,
	"importe_acreditado" numeric(12, 2) NOT NULL,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acreditacion_handy_viaje" (
	"acreditacion_id" bigint NOT NULL,
	"viaje_id" bigint NOT NULL,
	CONSTRAINT "acreditacion_handy_viaje_acreditacion_id_viaje_id_pk" PRIMARY KEY("acreditacion_id","viaje_id")
);
--> statement-breakpoint
CREATE TABLE "ajuste" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" text NOT NULL,
	"accion" "accion_auditoria" NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	"motivo" text,
	"usuario_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aviso" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"referencia" text NOT NULL,
	"fecha_aviso" date NOT NULL,
	"enviado" boolean DEFAULT false NOT NULL,
	"posponer_hasta" date
);
--> statement-breakpoint
CREATE TABLE "categoria_gasto" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"es_de_coche" boolean DEFAULT false NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"observaciones" text,
	"plazo_dias" integer,
	"limite_fiado" numeric(12, 2),
	"ultimo_recordatorio" timestamp with time zone,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cliente_plazo_positivo" CHECK ("cliente"."plazo_dias" is null or "cliente"."plazo_dias" > 0),
	CONSTRAINT "cliente_limite_positivo" CHECK ("cliente"."limite_fiado" is null or "cliente"."limite_fiado" > 0)
);
--> statement-breakpoint
CREATE TABLE "cobro" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cliente_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"medio" "medio_cobro" NOT NULL,
	"recibido_por_id" bigint,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobro_importe_positivo" CHECK ("cobro"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "coche" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre_movil" text NOT NULL,
	"matricula" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuenta" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tipo" "tipo_cuenta" NOT NULL,
	"persona_id" bigint,
	"nombre" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cuenta_a_entregar_con_persona" CHECK (("cuenta"."tipo" = 'a_entregar') = ("cuenta"."persona_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "entrega" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"persona_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"esperado" numeric(12, 2) NOT NULL,
	"entregado" numeric(12, 2) NOT NULL,
	"diferencia" numeric(12, 2) NOT NULL,
	"nota" text,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrega_diferencia" CHECK ("entrega"."diferencia" = "entrega"."esperado" - "entrega"."entregado")
);
--> statement-breakpoint
CREATE TABLE "gasto" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"categoria_id" bigint NOT NULL,
	"coche_id" bigint,
	"descripcion" text,
	"estado" "estado_gasto" NOT NULL,
	"fecha_pago" date,
	"pagado_desde" bigint,
	"gasto_fijo_id" bigint,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gasto_importe_positivo" CHECK ("gasto"."importe" > 0),
	CONSTRAINT "gasto_pagado_completo" CHECK ("gasto"."estado" = 'pendiente' or ("gasto"."fecha_pago" is not null and "gasto"."pagado_desde" is not null))
);
--> statement-breakpoint
CREATE TABLE "gasto_fijo" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"categoria_id" bigint NOT NULL,
	"coche_id" bigint,
	"descripcion" text NOT NULL,
	"importe" numeric(12, 2),
	"frecuencia" "frecuencia_gasto" NOT NULL,
	"meses" smallint[],
	"dia_del_mes" smallint NOT NULL,
	"importe_estimado" boolean DEFAULT false NOT NULL,
	"cuotas_total" integer,
	"fecha_fin" date,
	"es_cuota_vehiculo" boolean DEFAULT false NOT NULL,
	"dias_aviso" smallint[] DEFAULT '{3,0}' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gasto_fijo_dia" CHECK ("gasto_fijo"."dia_del_mes" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "imputacion" (
	"cobro_id" bigint NOT NULL,
	"viaje_id" bigint NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	CONSTRAINT "imputacion_cobro_id_viaje_id_pk" PRIMARY KEY("cobro_id","viaje_id"),
	CONSTRAINT "imputacion_importe_positivo" CHECK ("imputacion"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "intento_login" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"exito" boolean NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liquidacion" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chofer_id" bigint NOT NULL,
	"turno_id" bigint,
	"regla_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"facturado" numeric(12, 2) NOT NULL,
	"parte_chofer" numeric(12, 2) NOT NULL,
	"adelantos_fiado" numeric(12, 2) NOT NULL,
	"gastos" numeric(12, 2) NOT NULL,
	"esperado" numeric(12, 2) NOT NULL,
	"entregado" numeric(12, 2) NOT NULL,
	"diferencia" numeric(12, 2) NOT NULL,
	"estado" "estado_liquidacion" DEFAULT 'confirmada' NOT NULL,
	"op_key" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llamada_perdida" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"hora" time,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimiento" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"cuenta_desde" bigint NOT NULL,
	"cuenta_hacia" bigint NOT NULL,
	"tipo" text NOT NULL,
	"origen_tabla" text NOT NULL,
	"origen_id" bigint NOT NULL,
	"revierte_id" bigint,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimiento_importe_positivo" CHECK ("movimiento"."importe" > 0),
	CONSTRAINT "movimiento_cuentas_distintas" CHECK ("movimiento"."cuenta_desde" <> "movimiento"."cuenta_hacia")
);
--> statement-breakpoint
CREATE TABLE "pago_empleado" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"persona_id" bigint NOT NULL,
	"concepto" "concepto_pago_empleado" NOT NULL,
	"periodo" text NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"fecha" date NOT NULL,
	"pagado_desde" bigint NOT NULL,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_empleado_importe_positivo" CHECK ("pago_empleado"."importe" > 0)
);
--> statement-breakpoint
CREATE TABLE "persona" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"tipo" "tipo_persona" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plantilla_turno" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"color" text,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regla_liquidacion" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chofer_id" bigint NOT NULL,
	"tipo" "tipo_liquidacion" NOT NULL,
	"porcentaje_puntos" integer,
	"jornal" numeric(12, 2),
	"modo_entrega" "modo_entrega" NOT NULL,
	"momento_fiado" "momento_fiado" NOT NULL,
	"incobrable" "incobrable" DEFAULT 'empresa' NOT NULL,
	"confirmada" boolean DEFAULT false NOT NULL,
	"vigente_desde" date NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regla_liquidacion_porcentaje" CHECK ("regla_liquidacion"."porcentaje_puntos" is null or "regla_liquidacion"."porcentaje_puntos" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"ultimo_uso" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sugerencia_estado" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"periodo" text NOT NULL,
	"estado" "estado_sugerencia" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suscripcion_push" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"usuario_id" bigint NOT NULL,
	"endpoint" text NOT NULL,
	"claves" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turno" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"coche_id" bigint NOT NULL,
	"chofer_id" bigint,
	"plantilla_id" bigint NOT NULL,
	"sustituye_a_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"hash_password" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'dueno' NOT NULL,
	"persona_id" bigint,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vencimiento" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"gasto_fijo_id" bigint NOT NULL,
	"periodo" text NOT NULL,
	"fecha_vence" date NOT NULL,
	"importe_estimado" numeric(12, 2),
	"importe_real" numeric(12, 2),
	"estado" "estado_vencimiento" DEFAULT 'pendiente' NOT NULL,
	"gasto_id" bigint
);
--> statement-breakpoint
CREATE TABLE "viaje" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"forma_pago" "forma_pago" NOT NULL,
	"chofer_id" bigint,
	"coche_id" bigint,
	"turno_id" bigint,
	"cliente_id" bigint,
	"recibido_por_id" bigint,
	"origen" "origen_viaje" DEFAULT 'normal' NOT NULL,
	"nota" text,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viaje_importe_positivo" CHECK ("viaje"."importe" > 0),
	CONSTRAINT "viaje_fiado_con_cliente" CHECK ("viaje"."forma_pago" <> 'fiado' or "viaje"."cliente_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "acreditacion_handy_viaje" ADD CONSTRAINT "acreditacion_handy_viaje_acreditacion_id_acreditacion_handy_id_fk" FOREIGN KEY ("acreditacion_id") REFERENCES "public"."acreditacion_handy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acreditacion_handy_viaje" ADD CONSTRAINT "acreditacion_handy_viaje_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_recibido_por_id_persona_id_fk" FOREIGN KEY ("recibido_por_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuenta" ADD CONSTRAINT "cuenta_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega" ADD CONSTRAINT "entrega_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_categoria_id_categoria_gasto_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_gasto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_coche_id_coche_id_fk" FOREIGN KEY ("coche_id") REFERENCES "public"."coche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_pagado_desde_cuenta_id_fk" FOREIGN KEY ("pagado_desde") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_gasto_fijo_id_gasto_fijo_id_fk" FOREIGN KEY ("gasto_fijo_id") REFERENCES "public"."gasto_fijo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto_fijo" ADD CONSTRAINT "gasto_fijo_categoria_id_categoria_gasto_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_gasto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gasto_fijo" ADD CONSTRAINT "gasto_fijo_coche_id_coche_id_fk" FOREIGN KEY ("coche_id") REFERENCES "public"."coche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion" ADD CONSTRAINT "imputacion_cobro_id_cobro_id_fk" FOREIGN KEY ("cobro_id") REFERENCES "public"."cobro"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imputacion" ADD CONSTRAINT "imputacion_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_chofer_id_persona_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_turno_id_turno_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_regla_id_regla_liquidacion_id_fk" FOREIGN KEY ("regla_id") REFERENCES "public"."regla_liquidacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_cuenta_desde_cuenta_id_fk" FOREIGN KEY ("cuenta_desde") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimiento" ADD CONSTRAINT "movimiento_cuenta_hacia_cuenta_id_fk" FOREIGN KEY ("cuenta_hacia") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_empleado" ADD CONSTRAINT "pago_empleado_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_empleado" ADD CONSTRAINT "pago_empleado_pagado_desde_cuenta_id_fk" FOREIGN KEY ("pagado_desde") REFERENCES "public"."cuenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regla_liquidacion" ADD CONSTRAINT "regla_liquidacion_chofer_id_persona_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion_push" ADD CONSTRAINT "suscripcion_push_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_coche_id_coche_id_fk" FOREIGN KEY ("coche_id") REFERENCES "public"."coche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_chofer_id_persona_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_plantilla_id_plantilla_turno_id_fk" FOREIGN KEY ("plantilla_id") REFERENCES "public"."plantilla_turno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turno" ADD CONSTRAINT "turno_sustituye_a_id_persona_id_fk" FOREIGN KEY ("sustituye_a_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_gasto_fijo_id_gasto_fijo_id_fk" FOREIGN KEY ("gasto_fijo_id") REFERENCES "public"."gasto_fijo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vencimiento" ADD CONSTRAINT "vencimiento_gasto_id_gasto_id_fk" FOREIGN KEY ("gasto_id") REFERENCES "public"."gasto"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_chofer_id_persona_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_coche_id_coche_id_fk" FOREIGN KEY ("coche_id") REFERENCES "public"."coche"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_turno_id_turno_id_fk" FOREIGN KEY ("turno_id") REFERENCES "public"."turno"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_recibido_por_id_persona_id_fk" FOREIGN KEY ("recibido_por_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acreditacion_handy_op_key" ON "acreditacion_handy" USING btree ("op_key");--> statement-breakpoint
CREATE INDEX "auditoria_registro" ON "auditoria" USING btree ("tabla","registro_id");--> statement-breakpoint
CREATE INDEX "auditoria_fecha" ON "auditoria" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "aviso_unico" ON "aviso" USING btree ("tipo","referencia","fecha_aviso");--> statement-breakpoint
CREATE UNIQUE INDEX "categoria_gasto_nombre" ON "categoria_gasto" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "cliente_nombre" ON "cliente" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "cobro_op_key" ON "cobro" USING btree ("op_key");--> statement-breakpoint
CREATE INDEX "cobro_cliente" ON "cobro" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coche_matricula_unica" ON "coche" USING btree ("matricula");--> statement-breakpoint
CREATE UNIQUE INDEX "cuenta_por_persona" ON "cuenta" USING btree ("tipo","persona_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entrega_op_key" ON "entrega" USING btree ("op_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gasto_op_key" ON "gasto" USING btree ("op_key");--> statement-breakpoint
CREATE INDEX "gasto_fecha" ON "gasto" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "imputacion_viaje" ON "imputacion" USING btree ("viaje_id");--> statement-breakpoint
CREATE INDEX "intento_login_email_fecha" ON "intento_login" USING btree ("email","creado_en");--> statement-breakpoint
CREATE INDEX "intento_login_ip_fecha" ON "intento_login" USING btree ("ip","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidacion_op_key" ON "liquidacion" USING btree ("op_key");--> statement-breakpoint
CREATE UNIQUE INDEX "liquidacion_turno" ON "liquidacion" USING btree ("turno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimiento_op_key" ON "movimiento" USING btree ("op_key");--> statement-breakpoint
CREATE INDEX "movimiento_desde" ON "movimiento" USING btree ("cuenta_desde");--> statement-breakpoint
CREATE INDEX "movimiento_hacia" ON "movimiento" USING btree ("cuenta_hacia");--> statement-breakpoint
CREATE INDEX "movimiento_origen" ON "movimiento" USING btree ("origen_tabla","origen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pago_empleado_op_key" ON "pago_empleado" USING btree ("op_key");--> statement-breakpoint
CREATE UNIQUE INDEX "regla_liquidacion_vigencia" ON "regla_liquidacion" USING btree ("chofer_id","vigente_desde");--> statement-breakpoint
CREATE INDEX "sesion_usuario" ON "sesion" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sugerencia_estado_unica" ON "sugerencia_estado" USING btree ("clave","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripcion_push_endpoint" ON "suscripcion_push" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "turno_unico" ON "turno" USING btree ("fecha","coche_id","plantilla_id");--> statement-breakpoint
CREATE INDEX "turno_chofer_fecha" ON "turno" USING btree ("chofer_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_unico" ON "usuario" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "vencimiento_periodo" ON "vencimiento" USING btree ("gasto_fijo_id","periodo");--> statement-breakpoint
CREATE INDEX "vencimiento_fecha" ON "vencimiento" USING btree ("fecha_vence");--> statement-breakpoint
CREATE UNIQUE INDEX "viaje_op_key" ON "viaje" USING btree ("op_key");--> statement-breakpoint
CREATE INDEX "viaje_fecha" ON "viaje" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "viaje_cliente" ON "viaje" USING btree ("cliente_id");