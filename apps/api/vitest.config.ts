import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/** Base aparte para pruebas: se borra y se vuelve a migrar en cada corrida. */
export const URL_BASE_PRUEBAS =
  process.env.TEST_DATABASE_URL ?? "postgres://taxis:taxis@localhost:5432/taxis_test";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { DATABASE_URL: URL_BASE_PRUEBAS, ENTORNO: "test" },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/preparar-base.ts"],
    // Todas las pruebas comparten la misma base y la limpian entre casos.
    fileParallelism: false,
    // workerd marca como "sin manejar" la lectura que se corta al cerrar el
    // socket de postgres.js, aunque el polyfill sí la espera (ver
    // patches/postgres@3.4.9.patch). Se ignora solo ese caso exacto: el mensaje
    // de cierre de socket nacido en la función `read` del polyfill.
    onUnhandledError(error) {
      const mensajeDeCierre = /^(Stream was cancelled\.|This socket has been closed\.)$/.test(error.message);
      const enLecturaDelPolyfill = /at read \(.*postgres[^)]*\/cf\/polyfills\.js/.test(error.stack ?? "");
      return mensajeDeCierre && enLecturaDelPolyfill ? false : undefined;
    },
  },
});
