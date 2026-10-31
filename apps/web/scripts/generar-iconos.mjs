// Genera los PNG del manifiesto a partir de public/icono.svg con el Chromium de Playwright.
//   pnpm --filter @taxis/web iconos
// Se corre a mano solo si cambia el ícono; los PNG quedan en el repo.
// Usa el Playwright que haya instalado (local o global, vía require).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const svg = readFileSync(new URL("../public/icono.svg", import.meta.url), "utf8");
const navegador = await chromium.launch();
try {
  for (const lado of [192, 512]) {
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } });
    await pagina.setContent(
      `<body style="margin:0">${svg.replace("<svg ", `<svg width="${lado}" height="${lado}" `)}</body>`,
    );
    await pagina.screenshot({ path: new URL(`../public/icono-${lado}.png`, import.meta.url).pathname, omitBackground: true });
    await pagina.close();
  }
} finally {
  await navegador.close();
}
console.log("Iconos generados en public/");
