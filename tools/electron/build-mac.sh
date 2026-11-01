#!/usr/bin/env bash
# Arma el instalador de macOS (dmg + zip) en el propio Mac.
#
# El .dmg solo se puede compilar en macOS: electron-builder necesita hdiutil y
# las herramientas de Apple. Este guion deja todo listo con un solo comando:
#
#   bash tools/electron/build-mac.sh
#
# Opciones:
#   --arch=arm64|x64   arquitectura del paquete (por omisión, la del equipo)
#   --sin-npm          no toca node_modules (útil si ya está instalado)
#
# Requiere Node 20 o superior y conexión a internet la primera vez (descarga
# Electron 43, la última rama que abre en macOS 12 Monterey).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ARCH=""
INSTALAR=1
for argumento in "$@"; do
  case "$argumento" in
    --arch=*) ARCH="${argumento#--arch=}" ;;
    --sin-npm) INSTALAR=0 ;;
    -h|--ayuda)
      cat <<'AYUDA'
Uso: bash tools/electron/build-mac.sh [--arch=arm64|x64] [--sin-npm]

  --arch=arm64|x64  arquitectura del paquete (por omisión, la del equipo)
  --sin-npm         no instala dependencias (usa node_modules existente)

Compila el .dmg y el .zip de macOS en el propio Mac. En otro sistema solo se
puede armar la carpeta de trabajo: node tools/electron/build.mjs --sin-instalador
AYUDA
      exit 0
      ;;
    *) echo "Opción desconocida: $argumento (usa --ayuda)" >&2; exit 2 ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  cat >&2 <<'AVISO'
Este guion compila el .dmg y necesita macOS: electron-builder usa hdiutil, que
solo existe en macOS. En otro sistema se puede armar la carpeta de trabajo con:

  node tools/electron/build.mjs --out=dist/electron --sin-instalador
AVISO
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node 20 o superior (https://nodejs.org)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR es antiguo: se necesita 20 o superior." >&2
  exit 1
fi

# La arquitectura del paquete no tiene por qué ser la del equipo que compila
# (un Mac con Apple Silicon puede producir el .dmg de Intel), pero si no se
# pide nada se usa la nativa, que es la que el usuario va a abrir.
if [ -z "$ARCH" ]; then
  case "$(uname -m)" in
    arm64) ARCH="arm64" ;;
    x86_64) ARCH="x64" ;;
    *) echo "Arquitectura no reconocida: $(uname -m). Usa --arch=arm64 o --arch=x64." >&2; exit 1 ;;
  esac
fi
case "$ARCH" in
  arm64|x64) : ;;
  *) echo "--arch debe ser arm64 o x64." >&2; exit 2 ;;
esac

echo "· Normia Planos CAD · instalador de macOS ($ARCH)"

if [ "$INSTALAR" -eq 1 ]; then
  # `npm ci` borra node_modules y respeta package-lock.json; si no hay copia
  # limpia se cae a `npm install`, y si ya existe se reutiliza.
  if [ ! -d node_modules ]; then
    if [ -f package-lock.json ]; then
      echo "· Instalando dependencias del proyecto (npm ci)…"
      npm ci --no-audit --no-fund
    else
      npm install --no-audit --no-fund
    fi
  fi
  # Electron y electron-builder no son dependencias del proyecto: van aparte y
  # sin guardarse en package.json. La rama 43 es la última que abre en macOS 12.
  echo "· Instalando Electron 43 y electron-builder 26…"
  npm install --no-save --no-audit --no-fund electron@43 electron-builder@26
fi

if [ ! -d node_modules/electron ] || [ ! -d node_modules/electron-builder ]; then
  echo "Faltan Electron y electron-builder en node_modules: vuelve a ejecutar sin --sin-npm." >&2
  exit 1
fi

node tools/electron/build.mjs --out=dist/electron "--arch=$ARCH"

echo
echo "Listo. Instaladores en dist/electron/installers/:"
ls -lh dist/electron/installers 2>/dev/null || true
echo
echo "Primera apertura sin certificado de Apple: clic derecho sobre la app › Abrir,"
echo "o bien: xattr -dr com.apple.quarantine \"/Applications/Normia Planos CAD.app\""
