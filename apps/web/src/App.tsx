import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import { BarraInferior } from "./componentes";
import { Ajustes, EditarAjuste } from "./pantallas/Ajustes";
import { AnotarCobro } from "./pantallas/AnotarCobro";
import { AnotarFiado } from "./pantallas/AnotarFiado";
import { AnotarViaje } from "./pantallas/AnotarViaje";
import { CambiarPassword } from "./pantallas/CambiarPassword";
import { CargaInicial } from "./pantallas/CargaInicial";
import { Cliente } from "./pantallas/Cliente";
import { ClienteForm } from "./pantallas/ClienteForm";
import { Coches, Personas } from "./pantallas/Flota";
import { Inicio } from "./pantallas/Inicio";
import { Login } from "./pantallas/Login";
import { Mas } from "./pantallas/Mas";
import { AcreditarHandy, Plata, RecibirPlata } from "./pantallas/Plata";
import { Proximamente } from "./pantallas/Proximamente";
import { QuienDebe } from "./pantallas/QuienDebe";
import { Viajes } from "./pantallas/Viajes";
import { useSesion } from "./sesion";

/** Pantallas con la barra de 5 pestañas abajo. */
function ConBarra() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Outlet />
      <BarraInferior />
    </div>
  );
}

export function App() {
  const { usuario, cargando } = useSesion();
  if (cargando) return <p className="p-6 text-suave">Cargando…</p>;
  if (!usuario) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ConBarra />}>
          <Route path="/" element={<Inicio />} />
          <Route path="/deben" element={<QuienDebe />} />
          <Route path="/clientes/nuevo" element={<ClienteForm />} />
          <Route path="/clientes/:id" element={<Cliente />} />
          <Route path="/clientes/:id/editar" element={<ClienteForm />} />
          <Route path="/clientes/:id/hoja" element={<CargaInicial />} />
          <Route path="/plata" element={<Plata />} />
          <Route path="/mas/viajes" element={<Viajes />} />
          <Route path="/ganancia" element={<Proximamente titulo="Ganancia" etapa="panel y ganancia" />} />
          <Route path="/mas" element={<Mas />} />
          <Route path="/mas/ajustes" element={<Ajustes />} />
          <Route path="/mas/ajustes/:clave" element={<EditarAjuste />} />
          <Route path="/mas/contrasena" element={<CambiarPassword />} />
          <Route path="/mas/personas" element={<Personas />} />
          <Route path="/mas/coches" element={<Coches />} />
          <Route path="*" element={<Proximamente titulo="No existe" etapa="—" />} />
        </Route>
        {/* Asistentes: pantalla completa, una pregunta por pantalla. */}
        <Route path="/cobro" element={<AnotarCobro />} />
        <Route path="/fiado" element={<AnotarFiado />} />
        <Route path="/viaje" element={<AnotarViaje />} />
        <Route path="/plata/recibir/:id" element={<RecibirPlata />} />
        <Route path="/plata/handy" element={<AcreditarHandy />} />
      </Routes>
    </BrowserRouter>
  );
}
