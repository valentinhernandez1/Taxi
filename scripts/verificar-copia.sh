#!/usr/bin/env bash
# Compara dos bases: filas por tabla y suma de cada columna de dinero (numeric).
# Sirve para confirmar que una restauración quedó igual al original.
#
#   scripts/verificar-copia.sh postgres://.../original postgres://.../restaurada
set -euo pipefail

origen="${1:?Uso: verificar-copia.sh <url_original> <url_restaurada>}"
destino="${2:?Uso: verificar-copia.sh <url_original> <url_restaurada>}"

# Arma una consulta con una fila por tabla: "esquema.tabla|filas|suma1;suma2;…".
resumen() {
  local url="$1" consulta
  consulta="$(psql "$url" --no-psqlrc --tuples-only --no-align --command "
    select string_agg(parte, ' union all ' order by tabla)
    from (
      select t.table_schema || '.' || t.table_name as tabla,
             format(
               'select %L || ''|'' || count(*) || ''|'' || %s from %I.%I',
               t.table_schema || '.' || t.table_name,
               coalesce(
                 (select string_agg(format('coalesce(sum(%I),0)::text', c.column_name), ' || '';'' || ' order by c.column_name)
                  from information_schema.columns c
                  where c.table_schema = t.table_schema and c.table_name = t.table_name and c.data_type = 'numeric'),
                 ''''''),
               t.table_schema, t.table_name) as parte
      from information_schema.tables t
      where t.table_type = 'BASE TABLE' and t.table_schema not in ('pg_catalog', 'information_schema')
    ) partes")"
  if [ -z "$consulta" ]; then return; fi
  psql "$url" --no-psqlrc --tuples-only --no-align --command "$consulta" | sort
}

a="$(mktemp)"; b="$(mktemp)"
trap 'rm -f "$a" "$b"' EXIT
resumen "$origen" > "$a"
resumen "$destino" > "$b"

echo "tabla|filas|totales de dinero"
cat "$a"
if diff -u "$a" "$b"; then
  echo "OK: $(wc -l < "$a") tablas iguales en filas y totales."
else
  echo "DIFERENCIAS entre el original y la restauración (arriba)." >&2
  exit 1
fi
