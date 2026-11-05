/*
 * Normia nativo · lector de JSON.
 *
 * El plano de Normia es un archivo JSON: el núcleo nativo tiene que poder
 * leerlo sin bibliotecas externas (regla del proyecto: solo activos locales y
 * ningún servicio por medio). Este lector entiende el subconjunto completo de
 * JSON —objetos, arreglos, cadenas con escapes, números, `true`, `false` y
 * `null`— y guarda el árbol en memoria.
 */
#ifndef NORMA_JSON_H
#define NORMA_JSON_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    NORMA_JSON_NULL = 0,
    NORMA_JSON_BOOL,
    NORMA_JSON_NUMBER,
    NORMA_JSON_STRING,
    NORMA_JSON_ARRAY,
    NORMA_JSON_OBJECT
} norma_json_type;

typedef struct norma_json norma_json;

struct norma_json {
    norma_json_type type;
    double number;
    int boolean;
    char *string;      /* cadenas: texto terminado en cero */
    size_t length;     /* cadenas: longitud; arreglos y objetos: elementos */
    size_t capacity;   /* arreglos y objetos: capacidad reservada */
    norma_json **items;
    char **keys;
};

/**
 * Lee un documento. Devuelve `NULL` si el texto no es JSON válido; en ese caso
 * `error` queda con una explicación corta y en español.
 */
norma_json *norma_json_parse(const char *text, size_t length, char *error, size_t error_size);

/** Igual que `norma_json_parse` pero sobre una cadena terminada en cero. */
norma_json *norma_json_parse_cstr(const char *text, char *error, size_t error_size);

/** Libera el árbol completo. Acepta `NULL`. */
void norma_json_free(norma_json *value);

/** Elemento de un objeto por clave; `NULL` si no está o no es objeto. */
const norma_json *norma_json_get(const norma_json *object, const char *key);

/** Elemento de un arreglo por índice; `NULL` si no está o no es arreglo. */
const norma_json *norma_json_at(const norma_json *array, size_t index);

/** Cantidad de elementos de un arreglo u objeto. */
size_t norma_json_size(const norma_json *value);

/** Número con valor por omisión si el nodo no es numérico. */
double norma_json_number(const norma_json *value, double fallback);

/** Texto de una cadena; `NULL` si el nodo no es cadena. */
const char *norma_json_string(const norma_json *value);

/** Texto de la clave `key`, o `fallback` si falta o no es cadena. */
const char *norma_json_string_at(const norma_json *object, const char *key, const char *fallback);

/** Entero redondeado de la clave `key`, o `fallback` si falta. */
int norma_json_int_at(const norma_json *object, const char *key, int fallback);

/** Valor lógico de la clave `key`, o `fallback` si falta. */
int norma_json_bool_at(const norma_json *object, const char *key, int fallback);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_JSON_H */
