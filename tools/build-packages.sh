#!/usr/bin/env bash
# Construye los paquetes de producción y demostración de Normia Planos CAD.
# Requiere: bash, tar, zip, sha256sum (utilidades estándar de Linux/macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(sed -nE "s/^define\('NORMA_VERSION', '([0-9]+\.[0-9]+\.[0-9]+)'\);.*/\1/p" bootstrap.php | head -1)"
if [ -z "${VERSION:-}" ]; then
  echo "No se pudo leer NORMA_VERSION desde bootstrap.php" >&2
  exit 1
fi

DIST="$ROOT/dist"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/normia-build-XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$DIST"
rm -f "$DIST"/normia-planos-cad-*.zip "$DIST/SHA256SUMS.txt" "$DIST/BUILD.txt"

EXCLUDES=(
  --exclude=.git
  --exclude=.gitignore
  --exclude=node_modules
  --exclude=dist
  --exclude=paquetes
  --exclude=coverage
  --exclude=tests
  --exclude=tools
  --exclude=package.json
  --exclude=package-lock.json
  --exclude=config/config.php
  --exclude='config/config.php.tmp-*'
  --exclude='*.sqlite'
  --exclude='*.sqlite-*'
  --exclude=storage/last-error.log
  --exclude='storage/sessions/*'
  --exclude='storage/logs/*'
  --exclude='storage/cache/*'
  --exclude='storage/plugins/*'
  --exclude=resources/demo/.demo-build
  --exclude='*.zip'
  --exclude='*.log'
  --exclude='*.tmp'
  --exclude=.DS_Store
)

copiar() {
  local destino="$1"
  mkdir -p "$destino"
  tar -C "$ROOT" "${EXCLUDES[@]}" -cf - . | tar -C "$destino" -xf -
  # Los directorios de datos deben existir aunque estén vacíos.
  mkdir -p "$destino/storage/sessions" "$destino/storage/logs" "$destino/storage/cache"
  for dir in sessions logs cache; do
    if [ ! -f "$destino/storage/$dir/.gitkeep" ]; then
      : > "$destino/storage/$dir/.gitkeep"
    fi
  done
  cp "$ROOT/docs/LEEME-PRIMERO.txt" "$destino/LEEME-PRIMERO.txt"
}

echo "Normia Planos CAD · paquete v$VERSION"
PROD="$STAGE/normia-planos-cad"
copiar "$PROD"

DEMO="$STAGE/normia-planos-cad-demo"
copiar "$DEMO"
printf 'Paquete de demostración generado por tools/build-packages.sh\nVersión: %s\n' "$VERSION" > "$DEMO/resources/demo/.demo-build"
{
  cat "$ROOT/docs/LEEME-PRIMERO.txt"
  echo
  echo "DEMOSTRACIÓN"
  echo "------------"
  echo "Este ZIP es la variante de demostración: el instalador viene con la casilla"
  echo "\"Cargar proyecto de demostración\" marcada. Los datos se guardan solo en esta"
  echo "instalación; no se incluyen bases de datos, sesiones ni credenciales."
} > "$DEMO/LEEME-PRIMERO.txt"

( cd "$STAGE" && zip -qr "$DIST/normia-planos-cad-$VERSION.zip" normia-planos-cad )
( cd "$STAGE" && zip -qr "$DIST/normia-planos-cad-demo-$VERSION.zip" normia-planos-cad-demo )

( cd "$DIST" && sha256sum "normia-planos-cad-$VERSION.zip" "normia-planos-cad-demo-$VERSION.zip" > SHA256SUMS.txt )

{
  echo "Normia Planos CAD v$VERSION"
  echo "Generado: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "PHP mínimo: 8.1 (sin extensiones raras; requiere pdo_sqlite y session)"
  echo
  cat "$DIST/SHA256SUMS.txt"
  echo
  echo "Contenido:"
  echo "  normia-planos-cad-$VERSION.zip       aplicación completa (instalador web)"
  echo "  normia-planos-cad-demo-$VERSION.zip  igual, con demostración premarcada"
  echo
  echo "Verificado por: node tests/php/package.mjs"
} > "$DIST/BUILD.txt"

echo
cat "$DIST/SHA256SUMS.txt"
echo
ls -lh "$DIST"
