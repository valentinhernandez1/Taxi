CREATE TABLE "fiado_incobrable" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"viaje_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"chofer_id" bigint,
	"descuento_chofer" numeric(12, 2) DEFAULT '0' NOT NULL,
	"parte_a_pagar" numeric(12, 2) DEFAULT '0' NOT NULL,
	"liquidacion_id" bigint,
	"motivo" text NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_en" timestamp with time zone,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiado_incobrable_importe" CHECK ("fiado_incobrable"."importe" > 0)
);
--> statement-breakpoint
ALTER TABLE "liquidacion" ADD COLUMN "descuentos" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fiado_incobrable" ADD CONSTRAINT "fiado_incobrable_viaje_id_viaje_id_fk" FOREIGN KEY ("viaje_id") REFERENCES "public"."viaje"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiado_incobrable" ADD CONSTRAINT "fiado_incobrable_chofer_id_persona_id_fk" FOREIGN KEY ("chofer_id") REFERENCES "public"."persona"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiado_incobrable" ADD CONSTRAINT "fiado_incobrable_liquidacion_id_liquidacion_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiado_incobrable_viaje" ON "fiado_incobrable" USING btree ("viaje_id") WHERE not "fiado_incobrable"."anulado";--> statement-breakpoint
-- Lo que falta pagar de cada fiado ahora descuenta lo marcado como incobrable
-- (que no se borra: queda en fiado_incobrable con su motivo). Misma vista, una columna más al final.
CREATE OR REPLACE VIEW fiado_pendiente AS
SELECT
  v.id AS viaje_id,
  v.cliente_id,
  v.fecha,
  v.origen,
  v.importe,
  COALESCE(SUM(i.importe) FILTER (WHERE c.id IS NOT NULL), 0)::numeric(12,2) AS pagado,
  (v.importe - COALESCE(SUM(i.importe) FILTER (WHERE c.id IS NOT NULL), 0) - COALESCE(MAX(fi.importe), 0))::numeric(12,2) AS pendiente,
  COALESCE(MAX(fi.importe), 0)::numeric(12,2) AS incobrable
FROM viaje v
LEFT JOIN imputacion i ON i.viaje_id = v.id
LEFT JOIN cobro c ON c.id = i.cobro_id AND NOT c.anulado
LEFT JOIN fiado_incobrable fi ON fi.viaje_id = v.id AND NOT fi.anulado
WHERE v.forma_pago = 'fiado' AND NOT v.anulado
GROUP BY v.id;
