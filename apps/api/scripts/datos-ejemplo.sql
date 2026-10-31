-- Datos de EJEMPLO para desarrollo y para probar copias. Nombres e importes
-- inventados; nunca datos reales (CLAUDE.md). Solo sobre una base recién migrada:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/scripts/datos-ejemplo.sql
begin;

insert into persona (nombre, telefono, tipo) values
  ('Dueño de ejemplo', null, 'dueno'),
  ('Chofer Uno', '099000001', 'chofer'),
  ('Chofer Dos', '099000002', 'chofer'),
  ('Chofer Tres', '099000003', 'chofer'),
  ('Telefonista de ejemplo', '099000009', 'telefonista');

insert into coche (nombre_movil, matricula) values ('Móvil 1', 'AAA 0001'), ('Móvil 2', 'AAA 0002');

insert into cliente (nombre, telefono, limite_fiado) values
  ('Cliente Rodríguez (ejemplo)', '099100001', 2000.00),
  ('Cliente Pérez (ejemplo)', '099100002', null),
  ('Almacén de ejemplo', null, 5000.00);

-- Las cuentas base (1 caja, 2 banco, 3 handy, 4 afuera) las crea la migración 0003.
insert into cuenta (tipo, persona_id, nombre) values
  ('a_entregar', 2, 'Tiene Chofer Uno'),
  ('a_entregar', 3, 'Tiene Chofer Dos'),
  ('a_entregar', 5, 'Tiene la telefonista');

insert into plantilla_turno (nombre, hora_inicio, hora_fin, color) values
  ('Día', '06:00', '18:00', '#FFD27A'), ('Noche', '18:00', '06:00', '#3E5C8A');

insert into turno (fecha, coche_id, chofer_id, plantilla_id) values
  ('2026-10-12', 1, 2, 1), ('2026-10-12', 1, 3, 2), ('2026-10-12', 2, 4, 1),
  ('2026-10-13', 1, 2, 1), ('2026-10-13', 2, 3, 1);

-- Viajes: efectivo, tarjeta y fiado; uno de carga inicial (caso 15).
insert into viaje (fecha, importe, forma_pago, chofer_id, coche_id, turno_id, cliente_id, recibido_por_id, origen, nota, op_key) values
  ('2026-10-12', 2000.00, 'efectivo', 2, 1, 1, null, 2, 'normal', null, 'ej-v1'),
  ('2026-10-12', 800.00, 'tarjeta', 2, 1, 1, null, null, 'normal', null, 'ej-v2'),
  ('2026-10-12', 500.00, 'fiado', 2, 1, 1, 1, null, 'normal', null, 'ej-v3'),
  ('2026-10-12', 0.10, 'efectivo', 3, 1, 2, null, 3, 'normal', null, 'ej-v4'),
  ('2026-10-12', 0.20, 'efectivo', 3, 1, 2, null, 3, 'normal', null, 'ej-v5'),
  ('2026-10-13', 300.00, 'fiado', 2, 1, 4, 1, null, 'normal', null, 'ej-v6'),
  ('2026-10-13', 1250.50, 'efectivo', 3, 2, 5, null, 3, 'normal', null, 'ej-v7'),
  ('2026-09-02', 700.00, 'fiado', null, null, null, 2, null, 'carga_inicial', 'Chofer anterior', 'ej-v8');

-- Cobro de 600 a Rodríguez, imputado FIFO: 500 al lunes y 100 al miércoles (caso 3).
insert into cobro (cliente_id, fecha, importe, medio, recibido_por_id, op_key) values
  (1, '2026-10-14', 600.00, 'efectivo', 2, 'ej-c1');
insert into imputacion (cobro_id, viaje_id, importe) values (1, 3, 500.00), (1, 6, 100.00);

insert into movimiento (fecha, importe, cuenta_desde, cuenta_hacia, tipo, origen_tabla, origen_id, op_key) values
  ('2026-10-12', 2000.00, 4, 5, 'viaje_efectivo', 'viaje', 1, 'ej-m1'),
  ('2026-10-12', 800.00, 4, 3, 'viaje_tarjeta', 'viaje', 2, 'ej-m2'),
  ('2026-10-14', 600.00, 4, 5, 'cobro_efectivo', 'cobro', 1, 'ej-m3'),
  ('2026-10-15', 550.00, 5, 1, 'entrega', 'entrega', 1, 'ej-m4');

insert into entrega (persona_id, fecha, esperado, entregado, diferencia, nota, op_key) values
  (2, '2026-10-15', 600.00, 550.00, 50.00, 'Dijo que falta un vuelto (ejemplo)', 'ej-e1');

insert into categoria_gasto (nombre, es_de_coche) values
  ('Combustible', true), ('Taller', true), ('Seguro', true), ('Cuota del coche', true),
  ('BPS', false), ('Teléfono', false), ('Comisión Handy', false);

insert into gasto_fijo (categoria_id, coche_id, descripcion, importe, frecuencia, dia_del_mes, cuotas_total, es_cuota_vehiculo) values
  (4, 2, 'Cuota Móvil 2', 9800.00, 'mensual', 10, 36, true),
  (5, null, 'Aporte BPS (monto estimado)', 4500.00, 'mensual', 15, null, false);

insert into gasto (fecha, importe, categoria_id, coche_id, descripcion, estado, fecha_pago, pagado_desde, op_key) values
  ('2026-10-12', 500.00, 1, 1, 'Nafta', 'pagado', '2026-10-12', 1, 'ej-g1'),
  ('2026-10-13', 3000.00, 3, 2, 'Seguro de octubre', 'pendiente', null, null, 'ej-g2');

insert into vencimiento (gasto_fijo_id, periodo, fecha_vence, importe_estimado, estado) values
  (1, '2026-10', '2026-10-10', 9800.00, 'pendiente'),
  (2, '2026-10', '2026-10-15', 4500.00, 'pendiente');

insert into regla_liquidacion (chofer_id, tipo, porcentaje_puntos, modo_entrega, momento_fiado, vigente_desde) values
  (2, 'porcentaje', 3000, 'se_queda_su_parte', 'A', '2026-10-01'),
  (3, 'porcentaje', 3000, 'entrega_todo', 'B', '2026-10-01');

insert into liquidacion (chofer_id, turno_id, regla_id, fecha, facturado, parte_chofer, adelantos_fiado, gastos, esperado, entregado, diferencia, op_key) values
  (2, 1, 1, '2026-10-12', 3800.00, 1140.00, 300.00, 500.00, 360.00, 360.00, 0.00, 'ej-l1');

insert into llamada_perdida (fecha, hora, nota) values ('2026-10-16', '22:15', 'Viernes de noche, no había coche');

insert into ajuste (clave, valor) values ('nombre_empresa', '"Taxis de ejemplo"'), ('alerta_amarilla_dias', '25');

insert into auditoria (tabla, registro_id, accion, antes, despues, motivo) values
  ('ajuste', 'alerta_amarilla_dias', 'modificar', '30', '25', 'Datos de ejemplo');

commit;
