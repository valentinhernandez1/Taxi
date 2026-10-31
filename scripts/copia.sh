#!/usr/bin/env bash
# Copia de la base: pg_dump en formato custom, cifrada con age.
#
#   DATABASE_URL=... AGE_RECIPIENT=age1... scripts/copia.sh [carpeta]
#
# Deja copias/taxis_AAAA-MM-DD_HHMM.dump.age y escribe su ruta en la salida.
# Solo se necesita la clave PÚBLICA para cifrar; la privada (para restaurar)
# nunca va al servidor ni al repositorio.
set -euo pipefail

: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${AGE_RECIPIENT:?Falta AGE_RECIPIENT (clave pública de age)}"

carpeta="${1:-copias}"
mkdir -p "$carpeta"
fecha="$(TZ=America/Montevideo date +%Y-%m-%d_%H%M)"
archivo="$carpeta/taxis_${fecha}.dump.age"
temporal="$archivo.parcial"

# pipefail: si pg_dump falla, falla todo y no queda una copia a medias con nombre final.
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" \
  | age --encrypt --recipient "$AGE_RECIPIENT" --output "$temporal"

if [ ! -s "$temporal" ]; then
  echo "La copia quedó vacía" >&2
  rm -f "$temporal"
  exit 1
fi
mv "$temporal" "$archivo"
echo "$archivo"
