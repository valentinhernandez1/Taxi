-- La auditoría solo crece (regla 6): ni la app ni un error de código pueden
-- modificar o borrar una fila. TRUNCATE queda permitido para las pruebas.
CREATE FUNCTION auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se modifica ni se borra (%)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auditoria_sin_cambios
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
