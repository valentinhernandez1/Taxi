import { useNavigate } from "react-router";
import { FilaMenu, ICONOS, Pantalla, Tarjeta } from "../componentes";
import { useSesion } from "../sesion";

export function Mas() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();
  return (
    <Pantalla titulo="Más">
      <Tarjeta>
        <FilaMenu a="/mas/viajes" icono={ICONOS.auto} texto="Viajes anotados" />
        <FilaMenu a="/mas/choferes" icono={ICONOS.personas} texto="Choferes y liquidaciones" />
        <FilaMenu a="/gastos" icono={ICONOS.recibo} texto="Gastos del mes" />
        <FilaMenu a="/vencimientos" icono={ICONOS.calendario} texto="Vencimientos" />
        <FilaMenu a="/mas/empleados" icono={ICONOS.personas} texto="Empleados y pagos" />
        <FilaMenu a="/mas/personas" icono={ICONOS.personas} texto="Choferes y personal" />
        <FilaMenu a="/mas/coches" icono={ICONOS.auto} texto="Coches" />
        <FilaMenu a="/mas/llamadas" icono={ICONOS.calendario} texto="Llamadas perdidas" />
        <FilaMenu a="/mas/exportar" icono={ICONOS.recibo} texto="Exportar a Excel" />
        <FilaMenu a="/mas/gastos-fijos" icono={ICONOS.calendario} texto="Gastos fijos" />
        <FilaMenu a="/mas/categorias" icono={ICONOS.recibo} texto="Tipos de gasto" />
        <FilaMenu a="/mas/ajustes" icono={ICONOS.ajustes} texto="Ajustes" />
        <FilaMenu a="/mas/contrasena" icono={ICONOS.llave} texto="Cambiar contraseña" />
        <FilaMenu
          icono={ICONOS.salir}
          texto="Salir"
          onClick={async () => {
            await salir();
            navegar("/");
          }}
        />
      </Tarjeta>
      {usuario && <p className="m-0 text-base text-suave">Entraste como {usuario.email}</p>}
    </Pantalla>
  );
}
