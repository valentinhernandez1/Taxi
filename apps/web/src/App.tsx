import { BrowserRouter, Route, Routes } from "react-router";
import { BarraInferior } from "./componentes";
import { Ajustes, EditarAjuste } from "./pantallas/Ajustes";
import { CambiarPassword } from "./pantallas/CambiarPassword";
import { Inicio } from "./pantallas/Inicio";
import { Login } from "./pantallas/Login";
import { Mas } from "./pantallas/Mas";
import { Proximamente } from "./pantallas/Proximamente";
import { useSesion } from "./sesion";

export function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <p className="p-6 text-suave">Cargando…</p>;
  if (!usuario) return <Login />;

  return (
    <BrowserRouter>
      <div className="flex min-h-dvh flex-col">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/deben" element={<Proximamente titulo="Quién debe" etapa="clientes, fiados y cobros" />} />
          <Route path="/plata" element={<Proximamente titulo="Dónde está la plata" etapa="viajes y plata" />} />
          <Route path="/ganancia" element={<Proximamente titulo="Ganancia" etapa="panel y ganancia" />} />
          <Route path="/mas" element={<Mas />} />
          <Route path="/mas/ajustes" element={<Ajustes />} />
          <Route path="/mas/ajustes/:clave" element={<EditarAjuste />} />
          <Route path="/mas/contrasena" element={<CambiarPassword />} />
          <Route path="*" element={<Proximamente titulo="No existe" etapa="—" />} />
        </Routes>
        <BarraInferior />
      </div>
    </BrowserRouter>
  );
}
