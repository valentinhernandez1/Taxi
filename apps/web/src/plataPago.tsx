import { Opcion } from "./asistente";
import { pesos, useCargar } from "./datos";
import type { ConQuePlata, Persona, ResumenPlata } from "./tipos";

/** ¿Con qué plata? Caja, banco o la plata que tiene alguien (por ejemplo, la recaudación de un chofer). */
export function ElegirPlata({ elegida, onElegir }: { elegida: ConQuePlata | null; onElegir: (p: ConQuePlata, texto: string) => void }) {
  const { datos: plata } = useCargar<ResumenPlata>("/plata");
  const { datos: personas } = useCargar<{ personas: Persona[] }>("/personas");
  const otros = personas?.personas.filter((p) => p.tipo !== "dueno") ?? [];
  const saldoDe = (id: number) => plata?.personas.find((p) => p.persona_id === id)?.saldo ?? 0;
  return (
    <>
      <Opcion
        elegida={elegida?.desde === "caja"}
        detalle={plata ? `Tenés ${pesos(plata.caja)}` : undefined}
        onClick={() => onElegir({ desde: "caja" }, "tu caja")}
      >
        Efectivo de tu caja
      </Opcion>
      <Opcion
        elegida={elegida?.desde === "banco"}
        detalle={plata ? `Hay ${pesos(plata.banco)}` : undefined}
        onClick={() => onElegir({ desde: "banco" }, "el banco")}
      >
        Banco
      </Opcion>
      {otros.map((p) => (
        <Opcion
          key={p.id}
          elegida={elegida?.desde === "persona" && elegida.persona_id === p.id}
          detalle={`Tiene ${pesos(saldoDe(p.id))} para entregarte`}
          onClick={() => onElegir({ desde: "persona", persona_id: p.id }, `la plata que tiene ${p.nombre}`)}
        >
          Con la plata de {p.nombre}
        </Opcion>
      ))}
    </>
  );
}
