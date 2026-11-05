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
SOURCES := src/units.c src/geometry.c src/json.c src/jsonw.c src/plan.c src/document.c
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

test: $(BUILD)/tests $(BUILD)/tests-document $(BUILD)/norma-core
	@echo "· Pruebas del núcleo"
	@$(BUILD)/tests
	@echo "· Pruebas del documento"
	@$(BUILD)/tests-document
	@echo "· El programa responde a --check"
	@$(BUILD)/norma-core --check

clean:
	rm -rf $(BUILD)

.PHONY: all test clean
