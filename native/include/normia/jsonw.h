/*
 * Normia nativo · escritor de JSON.
 *
 * El lector ya existe (`normia/json.h`). Para guardar hace falta lo contrario:
 * componer el plano con el mismo sobre oficial (`normia-plan`, esquema 3) que
 * la edición web y el estudio importan sin conversiones. Un búfer de texto con
 * escapes correctos es todo lo que hace falta y evita cualquier dependencia.
 */
#ifndef NORMA_JSONW_H
#define NORMA_JSONW_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char *text;
    size_t length;
    size_t capacity;
    int failed;
} norma_buffer;

void norma_buffer_init(norma_buffer *buffer);

/** Texto terminado en cero; `""` si algo falló. No se libera aquí. */
const char *norma_buffer_text(const norma_buffer *buffer);

void norma_buffer_free(norma_buffer *buffer);

/** Añade texto tal cual. */
void norma_buffer_raw(norma_buffer *buffer, const char *text);

/** Añade una cadena JSON, con comillas y escapes. */
void norma_buffer_string(norma_buffer *buffer, const char *text);

/** Añade un número JSON. Los enteros salen sin decimales. */
void norma_buffer_number(norma_buffer *buffer, double value);

/** Añade `true`, `false` o `null`. */
void norma_buffer_bool(norma_buffer *buffer, int value);

/** Añade `clave: valor`. */
void norma_buffer_key(norma_buffer *buffer, const char *key);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_JSONW_H */
