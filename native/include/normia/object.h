/*
 * Normia nativo · objetos que se insertan en el plano.
 *
 * Un plano de evacuación necesita algo más que trazos: **puertas** (con su vano
 * y su salida marcada), **equipos** (extintor, botiquín, camilla, DEA…) y
 * **señales** del catálogo. Este archivo dice qué se puede insertar, con qué
 * tamaño nace, a qué familia pertenece y cómo se coloca respecto al clic.
 *
 * Hay dos catálogos y los dos viven aquí:
 *
 *   · el **de respaldo**, once piezas escritas en C (`kFallback`), para que el
 *     núcleo funcione sin archivos al lado — pruebas, `--check`, un plano suelto;
 *   · el **completo**, que se lee en tiempo de ejecución de los tres catálogos
 *     locales y junta **820 objetos**: las 3 puertas, los 422 objetos CAD de
 *     `resources/cad-objects.json` y las 395 señales de `iso7010-catalog.json`
 *     y `service-signs.json`. No se copia ni un pictograma al código: el `<svg>`
 *     se guarda tal como viene, igual que en la web.
 *
 * Los tamaños con los que nace cada objeto son los de `DesignValidator::defaults()`:
 * la puerta mide 90 × 90 cm, un objeto CAD 90 × 90 cm y una señal 64 × 64 cm.
 *
 * La regla de colocación es la misma que usan la web y el auditor:
 *
 *   · una **puerta** apoya su caja sobre el muro: la línea del muro es el borde
 *     inferior de la caja (`y + h`), que es justo el punto por el que se sale y
 *     desde el que `travel.c` siembra el recorrido;
 *   · un **equipo** o una **señal** se centra en el punto: el auditor mide
 *     desde `x + w/2`, `y + h/2`.
 */
#ifndef NORMA_OBJECT_H
#define NORMA_OBJECT_H

#include <stddef.h>

#include "normia/geometry.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Cuántos objetos ofrece el menú Insertar sin catálogos al lado. */
#define NORMA_OBJECT_FALLBACK_COUNT 11

/** Topes de los textos de una pieza del catálogo (los pone el catálogo). */
#define NORMA_OBJECT_TYPE 48
#define NORMA_OBJECT_NAME 100
#define NORMA_OBJECT_FAMILY 40
#define NORMA_OBJECT_LABEL 72
#define NORMA_OBJECT_COLOUR 16

typedef struct {
    /** Tipo que se guarda en el plano (`door`, `cad_emg_aed`, `iso_e001`…). */
    char type[NORMA_OBJECT_TYPE];
    /** Nombre que ve la persona en el menú. */
    char name[NORMA_OBJECT_NAME];
    /** Clave de la familia a la que pertenece (`door`, `cad:emergency`, `sign:fire`…). */
    char family[NORMA_OBJECT_FAMILY];
    /** Rótulo de la familia, tal como lo escribe el catálogo. */
    char family_label[NORMA_OBJECT_LABEL];
    /** Color de la familia, el mismo que usa la web. */
    char colour[NORMA_OBJECT_COLOUR];
    /** Pictograma del catálogo, o `NULL` si se dibuja a mano (las puertas). */
    char *svg;
    /** Ancho y alto de la caja al nacer, en centímetros. */
    double width;
    double height;
    /** Grosor de trazo con el que nace. */
    double stroke;
    /**
     * 1 si la caja se apoya sobre el muro (la línea del muro es `y + h`), 0 si
     * se centra en el punto donde se hace clic.
     */
    int on_wall;
    /** 1 si el objeto es una puerta que puede marcarse como salida. */
    int is_door;
} norma_object_spec;

/** El catálogo completo, en el orden del menú. */
typedef struct {
    norma_object_spec *items;
    size_t count;
    size_t capacity;
    /** 1 si se leyó de `resources/`; 0 si es el de respaldo. */
    int loaded;
    /** Carpeta de la que se leyeron los catálogos (para poder decirlo). */
    char source[256];
} norma_object_catalog;

/* ------------------------------- respaldo -------------------------------- */

/** Cuántos objetos hay: los del catálogo activo, o los once de respaldo. */
size_t norma_object_count(void);

/** El objeto `index` del catálogo activo; `NULL` fuera de rango. */
const norma_object_spec *norma_object_at(size_t index);

/** El objeto de ese tipo, o `NULL` si no se puede insertar. */
const norma_object_spec *norma_object_find(const char *type);

/** ¿Este tipo es una puerta? (`door`, `door_double`, `door_garage`). */
int norma_object_is_door(const char *type);

/**
 * Esquina superior izquierda de la caja al hacer clic en `point`.
 * No toca el documento: sirve también para previsualizar.
 */
void norma_object_place(const norma_object_spec *spec, norma_point point, double *x, double *y);

/* ------------------------- el catálogo completo -------------------------- */

/**
 * Lee `cad-objects.json`, `iso7010-catalog.json` y `service-signs.json` de
 * `directory` y arma el catálogo completo (820 piezas). Devuelve 1 si cargó
 * todo; 0 y un motivo en español si algo falta o no es válido.
 *
 * Deja la estructura como nueva: si ya había un catálogo cargado, hay que
 * liberarlo antes con `norma_object_catalog_free()`.
 */
int norma_object_catalog_load(norma_object_catalog *catalog, const char *directory,
                              char *error, size_t error_size);

void norma_object_catalog_free(norma_object_catalog *catalog);

/**
 * Pone el catálogo que usan `norma_object_count/at/find` y el SVG. Con `NULL`
 * vuelve al de respaldo. Devuelve 1 si quedó activo ese catálogo.
 */
int norma_object_use(const norma_object_catalog *catalog);

/** El catálogo activo, o `NULL` si se está usando el de respaldo. */
const norma_object_catalog *norma_object_active(void);

/* ------------------------------- familias -------------------------------- */

/** Cuántas familias tiene el catálogo, en el orden del menú. */
size_t norma_object_family_count(void);

/** Clave de la familia `index`; `NULL` fuera de rango. */
const char *norma_object_family_at(size_t index);

/** Rótulo de la familia `index`; `NULL` fuera de rango. */
const char *norma_object_family_label_at(size_t index);

/** Rótulo de una familia por su clave; `NULL` si no existe. */
const char *norma_object_family_label(const char *family);

/** Cuántos objetos tiene una familia. */
size_t norma_object_count_in(const char *family);

/** El objeto `index` de una familia; `NULL` si no hay. */
const norma_object_spec *norma_object_at_in(const char *family, size_t index);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_OBJECT_H */
