/**
 * Exportar a Excel (CSV). Separador ";" y coma decimal, como lo espera Excel
 * en español; con marca UTF-8 para que se vean bien los acentos.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/cliente";
import { ErrorNegocio } from "../errores";

export const QUE_SE_EXPORTA = ["viajes", "cobros", "gastos", "movimientos"] as const;
export type QueSeExporta = (typeof QUE_SE_EXPORTA)[number];

/** "1250.50" → "1250,50" (NUMERIC tal cual, sin pasar por float). */
function importe(texto: string | null | undefined): string {
  return texto == null ? "" : texto.replace(".", ",");
}

function celda(valor: unknown): string {
  const t = valor === null || valor === undefined ? "" : String(valor);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function csv(encabezados: string[], filas: unknown[][]): string {
  return `\uFEFF${[encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n")}\r\n`;
}

export async function exportar(db: Db, que: QueSeExporta, desde: string, hasta: string): Promise<string> {
  if (desde > hasta) throw new ErrorNegocio("La fecha de inicio es después de la de fin");
  switch (que) {
    case "viajes": {
      const filas = await db.execute<Record<string, string | null>>(sql`
        select v.fecha::text, v.forma_pago::text, v.importe::text, p.nombre as chofer, co.nombre_movil as coche, cl.nombre as cliente,
          v.origen::text, case when v.anulado then 'sí' else 'no' end as anulado, v.motivo_anulacion
        from viaje v left join persona p on p.id = v.chofer_id left join coche co on co.id = v.coche_id left join cliente cl on cl.id = v.cliente_id
        where v.fecha between ${desde} and ${hasta} order by v.fecha, v.id`);
      return csv(
        ["Fecha", "Forma de pago", "Importe", "Chofer", "Coche", "Cliente", "Origen", "Anulado", "Motivo"],
        filas.map((f) => [f.fecha, f.forma_pago, importe(f.importe), f.chofer, f.coche, f.cliente, f.origen, f.anulado, f.motivo_anulacion]),
      );
    }
    case "cobros": {
      const filas = await db.execute<Record<string, string | null>>(sql`
        select c.fecha::text, cl.nombre as cliente, c.importe::text, c.medio::text, p.nombre as recibio, c.origen::text,
          case when c.anulado then 'sí' else 'no' end as anulado, c.motivo_anulacion
        from cobro c join cliente cl on cl.id = c.cliente_id left join persona p on p.id = c.recibido_por_id
        where c.fecha between ${desde} and ${hasta} order by c.fecha, c.id`);
      return csv(
        ["Fecha", "Cliente", "Importe", "Medio", "Lo recibió", "Origen", "Anulado", "Motivo"],
        filas.map((f) => [f.fecha, f.cliente, importe(f.importe), f.medio, f.recibio, f.origen, f.anulado, f.motivo_anulacion]),
      );
    }
    case "gastos": {
      const filas = await db.execute<Record<string, string | null>>(sql`
        select g.fecha::text, c.nombre as categoria, case when c.es_cuota_vehiculo then 'sí' else 'no' end as cuota, co.nombre_movil as coche,
          g.descripcion, g.importe::text, g.estado::text, g.fecha_pago::text, cu.nombre as pagado_desde,
          case when g.anulado then 'sí' else 'no' end as anulado, g.motivo_anulacion
        from gasto g join categoria_gasto c on c.id = g.categoria_id left join coche co on co.id = g.coche_id left join cuenta cu on cu.id = g.pagado_desde
        where g.fecha between ${desde} and ${hasta} order by g.fecha, g.id`);
      return csv(
        ["Fecha", "Tipo de gasto", "Cuota de coche", "Coche", "Descripción", "Importe", "Estado", "Fecha de pago", "Pagado con", "Anulado", "Motivo"],
        filas.map((f) => [f.fecha, f.categoria, f.cuota, f.coche, f.descripcion, importe(f.importe), f.estado, f.fecha_pago, f.pagado_desde, f.anulado, f.motivo_anulacion]),
      );
    }
    case "movimientos": {
      const filas = await db.execute<Record<string, string | null>>(sql`
        select m.fecha::text, m.tipo, d.nombre as desde, h.nombre as hacia, m.importe::text, m.origen_tabla, m.origen_id::text,
          case when m.revierte_id is null then '' else 'anulación' end as anulacion
        from movimiento m join cuenta d on d.id = m.cuenta_desde join cuenta h on h.id = m.cuenta_hacia
        where m.fecha between ${desde} and ${hasta} order by m.fecha, m.id`);
      return csv(
        ["Fecha", "Tipo", "Sale de", "Va a", "Importe", "Registro", "Número", "Anulación"],
        filas.map((f) => [f.fecha, f.tipo, f.desde, f.hacia, importe(f.importe), f.origen_tabla, f.origen_id, f.anulacion]),
      );
    }
  }
}
