-- Categorías de gasto iniciales (configurables en Ajustes). "es_de_coche": se
-- pregunta de qué coche es. "Cuota del coche" va aparte de los gastos de
-- funcionamiento (regla 11). La comisión de Handy se carga sola al acreditar.
INSERT INTO categoria_gasto (nombre, es_de_coche, es_cuota_vehiculo) VALUES
  ('Combustible', true, false),
  ('Taller', true, false),
  ('Repuestos', true, false),
  ('Gomería', true, false),
  ('Lavado', true, false),
  ('Seguro', true, false),
  ('Patente', true, false),
  ('Cuota del coche', true, true),
  ('BPS', false, false),
  ('DGI', false, false),
  ('UTE', false, false),
  ('OSE', false, false),
  ('Antel', false, false),
  ('Teléfono', false, false),
  ('POS', false, false),
  ('Comisión Handy', false, false),
  ('Otro gasto', false, false)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Saldo de cada lugar de la plata: lo que entró menos lo que salió (regla 5).
CREATE VIEW saldo_cuenta AS
SELECT
  c.id AS cuenta_id,
  c.tipo,
  c.persona_id,
  c.nombre,
  (COALESCE(e.entro, 0) - COALESCE(s.salio, 0))::numeric(12,2) AS saldo
FROM cuenta c
LEFT JOIN (SELECT cuenta_hacia AS id, SUM(importe) AS entro FROM movimiento GROUP BY cuenta_hacia) e ON e.id = c.id
LEFT JOIN (SELECT cuenta_desde AS id, SUM(importe) AS salio FROM movimiento GROUP BY cuenta_desde) s ON s.id = c.id;
