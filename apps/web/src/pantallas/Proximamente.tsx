import { Pantalla, Tarjeta } from "../componentes";

export function Proximamente({ titulo, etapa }: { titulo: string; etapa: string }) {
  return (
    <Pantalla titulo={titulo}>
      <Tarjeta className="p-4">
        <p className="m-0">Esta parte todavía no está lista. Llega en la etapa de {etapa}.</p>
      </Tarjeta>
    </Pantalla>
  );
}
