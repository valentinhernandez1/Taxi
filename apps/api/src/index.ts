import { app } from "./app";
import { conectar } from "./db/cliente";
import type { Env } from "./env";
import { avisoDiario } from "./servicios/push";

export default {
  fetch: app.fetch,
  /** Una vez por día (cron en wrangler.produccion.jsonc): avisos al celular si hay algo para avisar. */
  async scheduled(_evento, env, ctx) {
    const { db, cerrar } = conectar(env.DATABASE_URL);
    ctx.waitUntil(
      avisoDiario(db, env)
        .then((r) => console.log("Aviso diario:", JSON.stringify(r)))
        .catch((e: unknown) => console.error("Aviso diario falló:", e))
        .finally(() => cerrar()),
    );
  },
} satisfies ExportedHandler<Env>;
