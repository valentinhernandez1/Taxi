ALTER TABLE "gasto" ADD COLUMN "liquidacion_id" bigint;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD COLUMN "parte_fiados_cobrados" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD COLUMN "nota" text;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD COLUMN "anulado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD COLUMN "motivo_anulacion" text;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "liquidacion_id" bigint;--> statement-breakpoint
ALTER TABLE "viaje" ADD COLUMN "parte_fiado_liquidacion_id" bigint;--> statement-breakpoint
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_liquidacion_id_liquidacion_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_liquidacion_id_liquidacion_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viaje" ADD CONSTRAINT "viaje_parte_fiado_liquidacion_id_liquidacion_id_fk" FOREIGN KEY ("parte_fiado_liquidacion_id") REFERENCES "public"."liquidacion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "viaje_chofer_sin_liquidar" ON "viaje" USING btree ("chofer_id") WHERE "viaje"."liquidacion_id" is null;