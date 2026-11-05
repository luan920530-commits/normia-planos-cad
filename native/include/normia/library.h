/*
 * Normia nativo · biblioteca de señalización.
 *
 * Carga **todos** los pictogramas que trae la aplicación, los mismos dos
 * catálogos que usa la edición web:
 *
 *   · `resources/iso7010-catalog.json`  → 332 señales ISO 7010 (E, F, M, P, W);
 *   · `resources/service-signs.json`    → 63 señales propias de orientación
 *                                          (`SVC_…`: ubicación, servicios,
 *                                          tránsito y brigada).
 *
 * Son 395 pictogramas. No se copian al código en C: se leen del catálogo local
 * en tiempo de ejecución, igual que el SVG exportado los toma de ahí. Así una
 * señal nueva entra en las dos ediciones al mismo tiempo, sin recompilar nada.
 *
 * Licencias, que se conservan tal cual vienen en el catálogo: los pictogramas
 * ISO 7010 son MIT © Karl Norling (`@iso-safety-signs/core 1.1.0`, pictogramas
 * de Wikimedia Commons) y las señales de orientación son originales del
 * proyecto (GPL-3.0). Ninguna de las dos certifica cumplimiento normativo.
 */
#ifndef NORMA_LIBRARY_H
#define NORMA_LIBRARY_H

#include <stddef.h>

#include "normia/jsonw.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Nombre largo de una señal, con su código y categoría. */
typedef struct {
    char code[32];
    char name[160];
    char category[24];
    /** Color de la familia, el mismo de `LibraryRepository::SIGN_COLORS`. */
    char color[16];
    /** Pictograma original, tal como está en el catálogo. */
    char *svg;
} norma_sign;

typedef struct {
    norma_sign *items;
    size_t count;
    size_t capacity;
    /** Carpeta de la que se leyeron los catálogos (para poder decirlo). */
    char source[256];
} norma_library;

/** Color de una categoría; `#334155` si no está en la tabla. */
const char *norma_library_color_for(const char *category);

/**
 * Lee los dos catálogos de la carpeta indicada (`resources/`).
 * Devuelve 1 si cargó todo; 0 y un motivo en español si algo falta.
 */
int norma_library_load(const char *directory, norma_library *library, char *error, size_t error_size);

void norma_library_free(norma_library *library);

/** Señal por código exacto (`E002`, `SVC_AQUI`); `NULL` si no está. */
const norma_sign *norma_library_sign(const norma_library *library, const char *code);

/**
 * Código del catálogo para un tipo del editor, como `codeForType`:
 * `iso_e002` → `E002`, `sig_wc_men` → `SVC_WC_MEN`, `plg_x` → `PLG_X`.
 * Escribe en `out` y devuelve su puntero, o `NULL` si el tipo no es una señal.
 */
const char *norma_library_code_for_type(const norma_library *library, const char *type,
                                        char *out, size_t out_size);

/** Tipo del editor para un código, como `typeForCode`. */
const char *norma_library_type_for_code(const char *code, char *out, size_t out_size);

/**
 * Comprueba que un pictograma es seguro para insertarlo en un SVG, con las
 * mismas reglas que `LibraryRepository::safeSvg`: sin scripts, sin manejadores
 * de eventos, sin referencias externas y sin entidades.
 */
int norma_library_safe_svg(const char *svg);

/** Número SVG como `SvgAsset::num`: 2 decimales, sin ceros sobrantes. */
void norma_library_number(double value, char *out, size_t size);

/**
 * Escribe el `<svg>` anidado de una señal dentro de otro SVG, como
 * `SvgAsset::nested`: conserva el `viewBox`, copia los atributos de
 * presentación de la etiqueta raíz y no añade nada externo.
 * Devuelve 1 si lo escribió.
 */
int norma_library_nested_svg(const norma_sign *sign, double x, double y, double w, double h,
                             const char *color, norma_buffer *out);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_LIBRARY_H */
