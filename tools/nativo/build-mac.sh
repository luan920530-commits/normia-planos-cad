#!/usr/bin/env bash
# Arma el .dmg de la aplicación **nativa en C** (ventana AppKit) para macOS 12.
#
#   bash tools/nativo/build-mac.sh                 # la arquitectura del equipo
#   bash tools/nativo/build-mac.sh --arch=arm64    # o --arch=x64 (solo en un Mac Intel)
#   bash tools/nativo/build-mac.sh --sin-dmg       # solo compila y firma la .app
#
# Qué hace, en orden: compila con destino **macOS 12 Monterey** (no el macOS del
# equipo que compila), genera el icono desde el logo, escribe la versión de
# `package.json` en el Info.plist, comprueba que el Mach-O pida 12.0 y la
# arquitectura correcta, firma en modo ad-hoc, arranca `--check` y arma el
# `.dmg` (con el enlace a Aplicaciones) y el `.zip`, con sus sumas SHA-256.
#
# Requiere las herramientas de Xcode (clang, hdiutil, PlistBuddy, codesign) y
# Node 18 o superior solo para el icono: si no hay Node, se compila igual y la
# aplicación sale con el icono del sistema.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DEPLOYMENT="12.0"
ARCH=""
SALIDA="dist/nativo"
DMG=1
ICONO=1
while [ $# -gt 0 ]; do
  case "$1" in
    --arch=*) ARCH="${1#--arch=}" ;;
    --deployment=*) DEPLOYMENT="${1#--deployment=}" ;;
    --salida=*) SALIDA="${1#--salida=}" ;;
    --sin-dmg) DMG=0 ;;
    --sin-icono) ICONO=0 ;;
    -h|--ayuda)
      cat <<'AYUDA'
Uso: bash tools/nativo/build-mac.sh [opciones]

  --arch=arm64|x64  arquitectura esperada del binario (por omisión, la del equipo).
                    No hay compilación cruzada: en un Mac Intel no sale un arm64.
  --deployment=12.0 destino mínimo de macOS (por omisión 12.0, Monterey)
  --salida=CARPETA  dónde quedan el .dmg y el .zip (por omisión dist/nativo)
  --sin-dmg         compila y firma la .app, sin armar los instaladores
  --sin-icono       no genera el .icns desde assets/img/normia-logo.png
AYUDA
      exit 0
      ;;
    *) echo "Opción desconocida: $1 (usa --ayuda)" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname -s)" != "Darwin" ]; then
  cat >&2 <<'AVISO'
Este guion compila la ventana AppKit y arma el .dmg: necesita macOS con Xcode.
El núcleo en C sí compila en Linux y Windows:  make -C native && make -C native test
AVISO
  exit 1
fi

APP="native/macos/build/NormiaEstudio.app"
PLIST="$APP/Contents/Info.plist"
BIN="$APP/Contents/MacOS/NormiaEstudio"

# La arquitectura del equipo es la del binario: clang de macOS no compila para
# otra. Si el usuario pide otra, se avisa **antes** de gastar la compilación.
NATIVA="$(uname -m)"
case "$NATIVA" in
  arm64) ESPERADA_NATIVA="arm64"; ETIQUETA="arm64" ;;
  x86_64) ESPERADA_NATIVA="x86_64"; ETIQUETA="x64" ;;
  *) echo "Arquitectura no reconocida: $NATIVA" >&2; exit 1 ;;
esac
if [ -n "$ARCH" ]; then
  case "$ARCH" in
    arm64) ESPERADA="arm64" ;;
    x64) ESPERADA="x86_64" ;;
    *) echo "--arch debe ser arm64 o x64." >&2; exit 2 ;;
  esac
  if [ "$ESPERADA" != "$ESPERADA_NATIVA" ]; then
    echo "Este equipo compila $ESPERADA_NATIVA, no $ESPERADA (no hay compilación cruzada)." >&2
    echo "Compila cada arquitectura en su propio Mac, como hace el flujo de GitHub." >&2
    exit 1
  fi
  ETIQUETA="$ARCH"
fi

VERSION="1.0.0"
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -p 'require("./package.json").version')"
elif [ -f package.json ]; then
  VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -1)"
fi

echo "· Normia Estudio nativo $VERSION · macOS $DEPLOYMENT mínimo · $ETIQUETA"

echo "· Compilando (make -C native/macos)…"
make -C native/macos DEPLOYMENT="$DEPLOYMENT" \
  CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter"

# El icono lo genera el mismo script que usan las ediciones Electron: el logo
# del repositorio, sin descargar nada.
if [ "$ICONO" -eq 1 ]; then
  if command -v node >/dev/null 2>&1 && [ -d node_modules/pngjs ]; then
    echo "· Generando el icono…"
    node tools/electron/make-icon.mjs assets/img/normia-logo.png native/macos/build/icono >/dev/null
    cp native/macos/build/icono/icon.icns "$APP/Contents/Resources/AppIcon.icns"
    /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$PLIST" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" "$PLIST"
  else
    echo "· Sin icono propio (falta Node o pngjs): la app usará el del sistema."
  fi
fi

# La versión del paquete sale de package.json, no del 0.1.0 de la etapa N1.
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST"
plutil -lint "$PLIST" >/dev/null

echo "· Comprobando el mínimo de macOS…"
MIN="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$PLIST")"
MINOS="$(otool -l "$BIN" | awk '/LC_BUILD_VERSION/{visto=1} visto && /minos/{print $2; exit}')"
ARCHS="$(lipo -archs "$BIN")"
echo "  Info.plist: $MIN · minos del binario: ${MINOS:-desconocido} · arquitecturas: $ARCHS"
if [ "$MIN" != "$DEPLOYMENT" ] || [ "$MINOS" != "$DEPLOYMENT" ]; then
  echo "El paquete no abre en macOS $DEPLOYMENT (plist $MIN, binario ${MINOS:-?})." >&2
  exit 1
fi
if [ "$ARCHS" != "$ESPERADA" ]; then
  echo "El binario es $ARCHS y se esperaba $ESPERADA." >&2
  exit 1
fi
for catalogo in iso7010-catalog.json service-signs.json cad-objects.json \
                audit-criteria.json extinguisher-criteria.json; do
  if [ ! -f "$APP/Contents/Resources/resources/$catalogo" ]; then
    echo "Falta el catálogo $catalogo dentro del paquete." >&2
    exit 1
  fi
done

# Sin certificado de Apple: firma ad-hoc, que es lo mínimo para que un arm64
# arranque. Gatekeeper seguirá preguntando la primera vez.
echo "· Firmando en modo ad-hoc…"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "· Arrancando el paquete con --check…"
"$BIN" --check

if [ "$DMG" -eq 0 ]; then
  echo
  echo "Listo. Aplicación en $APP (sin instaladores, por --sin-dmg)."
  exit 0
fi

echo "· Armando el .dmg y el .zip…"
STAGE="$(mktemp -d)"
MONTAJE="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$MONTAJE"' EXIT
cp -R "$APP" "$STAGE/Normia Estudio.app"
ln -s /Applications "$STAGE/Applications"

mkdir -p "$SALIDA"
BASE="normia-estudio-nativo-$VERSION-macos-$ETIQUETA"
hdiutil create -volname "Normia Estudio" -srcfolder "$STAGE" -ov -format UDZO \
  "$SALIDA/$BASE.dmg" > /dev/null
ditto -c -k --sequesterRsrc --keepParent "$APP" "$SALIDA/$BASE.zip"
(cd "$SALIDA" && shasum -a 256 "$BASE.dmg" "$BASE.zip" > "SHA256SUMS-$ETIQUETA.txt")

# Se vuelve a leer el mínimo **dentro del .dmg**: es el archivo que se descarga.
hdiutil attach "$SALIDA/$BASE.dmg" -nobrowse -quiet -mountpoint "$MONTAJE"
MIN_DMG="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$MONTAJE/Normia Estudio.app/Contents/Info.plist")"
MINOS_DMG="$(otool -l "$MONTAJE/Normia Estudio.app/Contents/MacOS/NormiaEstudio" \
  | awk '/LC_BUILD_VERSION/{visto=1} visto && /minos/{print $2; exit}')"
codesign --verify --deep --strict "$MONTAJE/Normia Estudio.app"
hdiutil detach "$MONTAJE" -quiet
echo "  dentro del .dmg: plist $MIN_DMG · minos $MINOS_DMG"
if [ "$MIN_DMG" != "$DEPLOYMENT" ] || [ "$MINOS_DMG" != "$DEPLOYMENT" ]; then
  echo "El .dmg publicado no abre en macOS $DEPLOYMENT." >&2
  exit 1
fi

echo
echo "Listo. Instaladores en $SALIDA/:"
ls -lh "$SALIDA"
echo
echo "Primera apertura sin certificado de Apple: clic derecho sobre la app › Abrir,"
echo "o bien: xattr -dr com.apple.quarantine \"/Applications/Normia Estudio.app\""
echo "Ojo: en macOS 12 Monterey esta app abre; las ediciones Electron piden lo mismo,"
echo "pero la nativa no trae navegador dentro."
