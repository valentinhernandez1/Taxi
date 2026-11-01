-- Gastos fijos: desde qué período generan vencimientos. Las filas que ya
-- existan toman el mes en que se crearon (hora de Uruguay); no se borra nada.
ALTER TABLE "gasto_fijo" ADD COLUMN "primer_periodo" text;--> statement-breakpoint
UPDATE "gasto_fijo" SET "primer_periodo" = to_char("creado_en" AT TIME ZONE 'America/Montevideo', 'YYYY-MM') WHERE "primer_periodo" IS NULL;--> statement-breakpoint
ALTER TABLE "gasto_fijo" ALTER COLUMN "primer_periodo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "gasto_fijo" ADD CONSTRAINT "gasto_fijo_primer_periodo" CHECK ("primer_periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "vencimiento" ADD COLUMN "avisar_desde" date;
