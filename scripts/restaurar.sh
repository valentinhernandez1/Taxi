#!/usr/bin/env bash
# Restaura una copia cifrada en una base VACÍA.
#
#   AGE_IDENTITY=~/clave-copias.txt scripts/restaurar.sh copias/taxis_....dump.age postgres://.../base_vacia
#
# Se niega a restaurar sobre una base que ya tiene tablas: para reemplazar
# producción primero se restaura en una base nueva, se verifica y recién
# después se cambia la DATABASE_URL.
set -euo pipefail

: "${AGE_IDENTITY:?Falta AGE_IDENTITY (archivo con la clave privada de age)}"
archivo="${1:?Uso: restaurar.sh <copia.dump.age> <url_base_vacia>}"
destino="${2:?Uso: restaurar.sh <copia.dump.age> <url_base_vacia>}"

tablas="$(psql "$destino" --no-psqlrc --tuples-only --no-align --command \
  "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")"
if [ "$tablas" != "0" ]; then
  echo "La base de destino no está vacía ($tablas tablas). No se toca." >&2
  exit 1
fi

age --decrypt --identity "$AGE_IDENTITY" "$archivo" \
  | pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname "$destino"

echo "Restaurada en $(psql "$destino" --no-psqlrc -tAc 'select current_database()')"
