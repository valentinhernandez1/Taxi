-- Horarios de turno de arranque (se cambian en Más → Turnos). Solo si todavía no hay ninguno.
INSERT INTO plantilla_turno (nombre, hora_inicio, hora_fin, color)
SELECT v.nombre, v.hora_inicio::time, v.hora_fin::time, v.color
FROM (VALUES ('Día', '06:00', '18:00', '#FFD27A'), ('Noche', '18:00', '06:00', '#3E5C8A')) AS v(nombre, hora_inicio, hora_fin, color)
WHERE NOT EXISTS (SELECT 1 FROM plantilla_turno);
