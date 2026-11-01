CREATE TABLE "push_suscripcion" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"ultimo_envio" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_suscripcion_endpoint" ON "push_suscripcion" USING btree ("endpoint");