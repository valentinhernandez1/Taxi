CREATE TABLE "dia_sin_trabajo" (
	"fecha" date PRIMARY KEY NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categoria_gasto" ADD COLUMN "es_cuota_vehiculo" boolean DEFAULT false NOT NULL;