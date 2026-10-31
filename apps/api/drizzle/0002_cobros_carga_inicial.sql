CREATE TYPE "public"."origen_cobro" AS ENUM('normal', 'carga_inicial');--> statement-breakpoint
ALTER TABLE "cobro" ALTER COLUMN "medio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cobro" ADD COLUMN "origen" "origen_cobro" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "cobro" ADD COLUMN "nota" text;--> statement-breakpoint
CREATE UNIQUE INDEX "cuenta_base_unica" ON "cuenta" USING btree ("tipo") WHERE "cuenta"."persona_id" is null;--> statement-breakpoint
ALTER TABLE "cobro" ADD CONSTRAINT "cobro_medio" CHECK ("cobro"."origen" = 'carga_inicial' or "cobro"."medio" is not null);