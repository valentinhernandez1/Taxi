CREATE TABLE "comprobante" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" bigint NOT NULL,
	"clave" text NOT NULL,
	"clave_miniatura" text,
	"tipo" text NOT NULL,
	"bytes" integer NOT NULL,
	"ancho" integer,
	"alto" integer,
	"op_key" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comprobante_tabla" CHECK ("comprobante"."tabla" in ('cobro', 'gasto')),
	CONSTRAINT "comprobante_bytes" CHECK ("comprobante"."bytes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_op_key" ON "comprobante" USING btree ("op_key");--> statement-breakpoint
CREATE UNIQUE INDEX "comprobante_clave" ON "comprobante" USING btree ("clave");--> statement-breakpoint
CREATE INDEX "comprobante_registro" ON "comprobante" USING btree ("tabla","registro_id");