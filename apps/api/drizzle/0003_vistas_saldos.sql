-- Cuentas base: dónde puede estar la plata (especificación §4, "Dónde está la plata").
-- "externo" es el afuera: clientes y proveedores. Las de cada persona se crean al usarse.
INSERT INTO cuenta (tipo, persona_id, nombre) VALUES
  ('caja', NULL, 'Caja del dueño'),
  ('banco', NULL, 'Banco'),
  ('handy', NULL, 'A acreditar por Handy'),
  ('externo', NULL, 'Afuera (clientes y proveedores)');
--> statement-breakpoint

-- Lo que falta pagar de cada viaje fiado. Ningún saldo se escribe a mano (regla 5):
-- sale de los viajes y de lo que se les aplicó desde cobros no anulados.
CREATE VIEW fiado_pendiente AS
SELECT
  v.id AS viaje_id,
  v.cliente_id,
  v.fecha,
  v.origen,
  v.importe,
  COALESCE(SUM(i.importe) FILTER (WHERE c.id IS NOT NULL), 0)::numeric(12,2) AS pagado,
  (v.importe - COALESCE(SUM(i.importe) FILTER (WHERE c.id IS NOT NULL), 0))::numeric(12,2) AS pendiente
FROM viaje v
LEFT JOIN imputacion i ON i.viaje_id = v.id
LEFT JOIN cobro c ON c.id = i.cobro_id AND NOT c.anulado
WHERE v.forma_pago = 'fiado' AND NOT v.anulado
GROUP BY v.id;
--> statement-breakpoint

-- Saldo de cada cliente: cuánto debe, cuánto tiene a favor y desde cuándo debe.
CREATE VIEW saldo_cliente AS
SELECT
  cl.id AS cliente_id,
  COALESCE(f.fiado, 0)::numeric(12,2) AS fiado,
  COALESCE(f.debe, 0)::numeric(12,2) AS debe,
  COALESCE(cb.cobrado, 0)::numeric(12,2) AS cobrado,
  (COALESCE(cb.cobrado, 0) - COALESCE(cb.aplicado, 0))::numeric(12,2) AS a_favor,
  f.mas_viejo_pendiente
FROM cliente cl
LEFT JOIN (
  SELECT cliente_id, SUM(importe) AS fiado, SUM(pendiente) AS debe,
         MIN(fecha) FILTER (WHERE pendiente > 0) AS mas_viejo_pendiente
  FROM fiado_pendiente
  GROUP BY cliente_id
) f ON f.cliente_id = cl.id
LEFT JOIN (
  SELECT c.cliente_id, SUM(c.importe) AS cobrado, SUM(COALESCE(i.total, 0)) AS aplicado
  FROM cobro c
  LEFT JOIN (SELECT cobro_id, SUM(importe) AS total FROM imputacion GROUP BY cobro_id) i ON i.cobro_id = c.id
  WHERE NOT c.anulado
  GROUP BY c.cliente_id
) cb ON cb.cliente_id = cl.id;
