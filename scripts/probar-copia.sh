#!/usr/bin/env bash
# Prueba de punta a punta de la copia y la restauración, con datos de ejemplo:
#   1. crea una base nueva, la migra y le carga datos de ejemplo;
#   2. hace la copia cifrada con una clave age descartable;
#   3. la restaura en otra base vacía;
#   4. compara filas y totales de dinero tabla por tabla;
#   5. confirma que la base restaurada sigue funcionando (la auditoría sigue sin dejarse borrar).
#
#   ADMIN_URL=postgres://taxis:taxis@localhost:5432/postgres scripts/probar-copia.sh
#
# Usa bases llamadas taxis_copia_origen y taxis_copia_restaurada y las borra al final.
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"

raiz="$(cd "$(dirname "$0")/.." && pwd)"
admin="${ADMIN_URL:-postgres://taxis:taxis@localhost:5432/postgres}"
base_url() { echo "${admin%/*}/$1"; }
origen="$(base_url taxis_copia_origen)"
restaurada="$(base_url taxis_copia_restaurada)"
trabajo="$(mktemp -d)"

limpiar() {
  psql "$admin" --no-psqlrc -q -c "drop database if exists taxis_copia_origen with (force)" \
    -c "drop database if exists taxis_copia_restaurada with (force)" >/dev/null || true
  rm -rf "$trabajo"
}
trap limpiar EXIT

echo "1. Base de origen con datos de ejemplo"
limpiar
trabajo="$(mktemp -d)"
psql "$admin" --no-psqlrc -q -c "create database taxis_copia_origen" -c "create database taxis_copia_restaurada"
DATABASE_URL="$origen" pnpm --silent --dir "$raiz" db:migrate
psql "$origen" --no-psqlrc -q -v ON_ERROR_STOP=1 -f "$raiz/apps/api/scripts/datos-ejemplo.sql"

echo "2. Copia cifrada"
age-keygen --output "$trabajo/clave.txt" 2>/dev/null
publica="$(age-keygen -y "$trabajo/clave.txt")"
archivo="$(DATABASE_URL="$origen" AGE_RECIPIENT="$publica" "$raiz/scripts/copia.sh" "$trabajo/copias")"
echo "   $archivo ($(wc -c < "$archivo") bytes)"
if head -c 64 "$archivo" | grep -q "PGDMP"; then
  echo "La copia no está cifrada" >&2
  exit 1
fi

echo "3. Restauración en base vacía"
AGE_IDENTITY="$trabajo/clave.txt" "$raiz/scripts/restaurar.sh" "$archivo" "$restaurada"
if AGE_IDENTITY="$trabajo/clave.txt" "$raiz/scripts/restaurar.sh" "$archivo" "$restaurada" 2>/dev/null; then
  echo "restaurar.sh pisó una base con datos" >&2
  exit 1
fi
echo "   (y se negó a restaurar encima de una base con datos)"

echo "4. Comparación"
"$raiz/scripts/verificar-copia.sh" "$origen" "$restaurada"
# Contraprueba: un centésimo de diferencia tiene que hacer fallar la verificación.
psql "$restaurada" --no-psqlrc -q -c "update viaje set importe = importe + 0.01 where op_key = 'ej-v1'"
if "$raiz/scripts/verificar-copia.sh" "$origen" "$restaurada" >/dev/null 2>&1; then
  echo "verificar-copia.sh no detectó una diferencia de 0,01" >&2
  exit 1
fi
echo "   (y detecta una diferencia de un centésimo)"

echo "5. La base restaurada sigue protegiendo la auditoría"
if psql "$restaurada" --no-psqlrc -q -c "delete from auditoria" 2>/dev/null; then
  echo "Se pudo borrar la auditoría en la base restaurada" >&2
  exit 1
fi
echo "   OK"
echo "Copia y restauración probadas."
