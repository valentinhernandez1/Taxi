import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono.svg"],
      manifest: {
        name: "Taxis — gestión",
        short_name: "Taxis",
        description: "Fiados, cobros, plata, gastos y ganancia de la empresa.",
        lang: "es-UY",
        start_url: "/",
        display: "standalone",
        background_color: "#F3F5F7",
        theme_color: "#0B57A4",
        icons: [
          { src: "icono-192.png", sizes: "192x192", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png" },
          { src: "icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // La app es siempre conectada: se guarda solo la cáscara, nunca la API.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Avisos al celular: el manejo del push está en public/push-sw.js.
        importScripts: ["push-sw.js"],
      },
    }),
  ],
  server: {
    // Mismo origen que en producción (Pages + Worker en /api): la cookie funciona sin CORS.
    proxy: { "/api": "http://localhost:8787" },
  },
});
