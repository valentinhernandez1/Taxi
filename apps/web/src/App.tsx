import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import { BarraInferior } from "./componentes";
import { Ajustes, EditarAjuste } from "./pantallas/Ajustes";
import { AnotarCobro } from "./pantallas/AnotarCobro";
import { AnotarFiado } from "./pantallas/AnotarFiado";
import { AnotarGasto } from "./pantallas/AnotarGasto";
import { AnotarViaje } from "./pantallas/AnotarViaje";
import { Choferes, FichaChofer, ReglaForm } from "./pantallas/Choferes";
import { Empleados, PagoEmpleado } from "./pantallas/Empleados";
import { FichaCoche } from "./pantallas/FichaCoche";
import { GastosDelMes, PagarVencimiento, Vencimientos } from "./pantallas/Gastos";
import { Categorias, GastoFijoForm, GastosFijos } from "./pantallas/GastosFijos";
import { CambiarPassword } from "./pantallas/CambiarPassword";
import { CargaInicial } from "./pantallas/CargaInicial";
import { Cliente } from "./pantallas/Cliente";
import { ClienteForm } from "./pantallas/ClienteForm";
import { Coches, Personas } from "./pantallas/Flota";
import { Inicio } from "./pantallas/Inicio";
import { Liquidacion } from "./pantallas/Liquidacion";
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
          <Route path="/gastos" element={<GastosDelMes />} />
          <Route path="/vencimientos" element={<Vencimientos />} />
          <Route path="/mas/gastos-fijos" element={<GastosFijos />} />
          <Route path="/mas/gastos-fijos/nuevo" element={<GastoFijoForm />} />
          <Route path="/mas/gastos-fijos/:id" element={<GastoFijoForm />} />
          <Route path="/mas/categorias" element={<Categorias />} />
          <Route path="/mas/empleados" element={<Empleados />} />
          <Route path="/mas/coches/:id" element={<FichaCoche />} />
          <Route path="/mas/choferes" element={<Choferes />} />
          <Route path="/mas/choferes/:id" element={<FichaChofer />} />
          <Route path="/mas/choferes/:id/regla" element={<ReglaForm />} />
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
        <Route path="/gasto" element={<AnotarGasto />} />
        <Route path="/vencimientos/:id/pagar" element={<PagarVencimiento />} />
        <Route path="/pago-empleado" element={<PagoEmpleado />} />
        <Route path="/liquidacion" element={<Liquidacion />} />
        <Route path="/plata/recibir/:id" element={<RecibirPlata />} />
        <Route path="/plata/handy" element={<AcreditarHandy />} />
      </Routes>
    </BrowserRouter>
  );
}
