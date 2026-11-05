# Normia · núcleo nativo en C
#
# Sin dependencias y sin pasos ocultos: `make` construye el programa y las
# pruebas, `make test` las ejecuta. Compila igual en macOS (clang), Linux (gcc)
# y Windows con MinGW o MSVC usando `make CC=clang`.
#
#   make            construye build/norma-core
#   make test       construye y ejecuta las pruebas del núcleo
#   make clean      borra lo construido

CC ?= cc
CFLAGS ?= -std=c11 -O2 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wstrict-prototypes
CPPFLAGS += -Iinclude
LDLIBS += -lm

BUILD := build
SOURCES := src/units.c src/geometry.c src/json.c src/jsonw.c src/format.c src/plan.c src/document.c src/svg.c src/grid.c src/audit.c src/travel.c src/findings.c src/library.c src/signage.c src/firstaid.c src/extinguisher.c
OBJECTS := $(SOURCES:src/%.c=$(BUILD)/%.o)
HEADERS := $(wildcard include/normia/*.h)

all: $(BUILD)/norma-core

$(BUILD):
	@mkdir -p $(BUILD)

$(BUILD)/%.o: src/%.c $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $< -o $@

$(BUILD)/norma-core: $(OBJECTS) $(BUILD)/cli.o
	$(CC) $(CFLAGS) $^ -o $@ $(LDLIBS)

$(BUILD)/tests: tests/test_core.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_core.c $(OBJECTS) -o $@ $(LDLIBS)

$(BUILD)/tests-document: tests/test_document.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_document.c $(OBJECTS) -o $@ $(LDLIBS)

$(BUILD)/tests-svg: tests/test_svg.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_svg.c $(OBJECTS) -o $@ $(LDLIBS)

$(BUILD)/tests-audit: tests/test_audit.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_audit.c $(OBJECTS) -o $@ $(LDLIBS)

$(BUILD)/tests-signs: tests/test_signs.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_signs.c $(OBJECTS) -o $@ $(LDLIBS)

$(BUILD)/tests-ext: tests/test_extinguishers.c $(OBJECTS) $(HEADERS) | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/test_extinguishers.c $(OBJECTS) -o $@ $(LDLIBS)

test: $(BUILD)/tests $(BUILD)/tests-document $(BUILD)/tests-svg $(BUILD)/tests-audit $(BUILD)/tests-signs $(BUILD)/tests-ext $(BUILD)/norma-core
	@echo "· Pruebas del núcleo"
	@$(BUILD)/tests
	@echo "· Pruebas del documento"
	@$(BUILD)/tests-document
	@echo "· Pruebas del SVG"
	@$(BUILD)/tests-svg
	@echo "· Pruebas de la rejilla y el aforo"
	@$(BUILD)/tests-audit
	@echo "· Pruebas de la señalización y los primeros auxilios"
	@$(BUILD)/tests-signs
	@echo "· Pruebas de la cobertura de extintores"
	@$(BUILD)/tests-ext
	@echo "· El programa responde a --check"
	@$(BUILD)/norma-core --check

clean:
	rm -rf $(BUILD)

.PHONY: all test clean
