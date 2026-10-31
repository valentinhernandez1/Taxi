import { useNavigate } from "react-router";
import { FilaMenu, ICONOS, Pantalla, Tarjeta } from "../componentes";
import { useSesion } from "../sesion";

export function Mas() {
  const { usuario, salir } = useSesion();
  const navegar = useNavigate();
  return (
    <Pantalla titulo="Más">
      <Tarjeta>
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
