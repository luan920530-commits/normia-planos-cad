# Normia Estudio · aplicación nativa de macOS (etapa N1)
#
# Compila con las herramientas que vienen con Xcode (clang + AppKit). No usa
# WebView, ni Electron, ni PHP: el lienzo es AppKit y los datos, el núcleo en C.
#
#   make            construye NormiaEstudio.app
#   make check      ejecuta la comprobación sin abrir ventana
#   make run        abre la aplicación
#   make clean      borra lo construido

APP := build/NormiaEstudio.app
BIN := $(APP)/Contents/MacOS/NormiaEstudio
CORE := ../src/units.c ../src/geometry.c ../src/json.c ../src/jsonw.c ../src/format.c ../src/plan.c ../src/document.c ../src/svg.c ../src/grid.c ../src/audit.c ../src/travel.c ../src/findings.c ../src/library.c ../src/signage.c ../src/firstaid.c ../src/extinguisher.c ../src/scenarios.c ../src/routes.c ../src/inspect.c
OBJC := main.m AppDelegate.m CanvasView.m
CFLAGS ?= -O2 -Wall -Wextra -Wno-unused-parameter
# Cocoa dibuja la ventana; UniformTypeIdentifiers da UTTypeJSON para los paneles.
FRAMEWORKS := -framework Cocoa -framework UniformTypeIdentifiers

all: $(BIN)

$(BIN): $(OBJC) Info.plist $(wildcard ../include/normia/*.h) $(CORE)
	@mkdir -p $(APP)/Contents/MacOS $(APP)/Contents/Resources
	clang -fobjc-arc -std=c11 $(CFLAGS) -I../include \
		$(OBJC) $(CORE) $(FRAMEWORKS) -lm -o $(BIN)
	@cp Info.plist $(APP)/Contents/Info.plist
	@# Los catálogos viajan dentro del paquete: sin ellos el cajón de revisión
	@# mide el plano pero no puede revisar señalización ni extintores.
	@mkdir -p $(APP)/Contents/Resources/resources
	@cp ../resources/*.json $(APP)/Contents/Resources/resources/
	@echo "· Aplicación armada: $(APP)"

check: $(BIN)
	@$(BIN) --check

run: $(BIN)
	@open $(APP)

clean:
	rm -rf build

.PHONY: all check run clean
