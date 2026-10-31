import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { ProveedorSesion } from "./sesion";
import "./estilos.css";

registerSW({ immediate: true });

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <ProveedorSesion>
      <App />
    </ProveedorSesion>
  </StrictMode>,
);
