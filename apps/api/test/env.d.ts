import type { Env as EnvApi } from "../src/env";

declare global {
  namespace Cloudflare {
    // `env` de "cloudflare:test" tiene los mismos bindings que el Worker.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- fusión de declaraciones
    interface Env extends EnvApi {}
  }
}
