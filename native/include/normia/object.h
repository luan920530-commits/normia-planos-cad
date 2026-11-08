/*
 * Normia nativo · objetos que se insertan en el plano.
 *
 * Hasta ahora la ventana nativa solo dibujaba trazos: muro, pluma, arco, cota y
 * ruta. Un plano de evacuación necesita además **puertas** (con su vano y su
 * salida marcada), **equipos** (extintor, botiquín, camilla, DEA) y **señales**
 * del catálogo. Este archivo dice qué se puede insertar, con qué tamaño nace y
 * cómo se coloca respecto al clic.
 *
 * Los tamaños están copiados de `DesignValidator::defaults()`, que es de donde
 * los toma la edición web: una puerta nace de 90 × 90 cm y un objeto del
 * catálogo de 90 × 90 cm. Si cambian allí, se cambian aquí, y la prueba
 * `parity.mjs` compara el resultado del auditor, no estos números.
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

/** Cuántos objetos ofrece el menú Insertar. */
#define NORMA_OBJECT_COUNT 11

typedef struct {
    /** Tipo que se guarda en el plano (`door`, `cad_ems_extinguisher`…). */
    const char *type;
    /** Nombre que ve la persona en el menú. */
    const char *name;
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

/** Todos los objetos insertables, en el orden del menú. */
size_t norma_object_count(void);
const norma_object_spec *norma_object_at(size_t index);

/** El objeto de ese tipo, o `NULL` si no se puede insertar. */
const norma_object_spec *norma_object_find(const char *type);

/**
 * Esquina superior izquierda de la caja al hacer clic en `point`.
 * No toca el documento: sirve también para previsualizar.
 */
void norma_object_place(const norma_object_spec *spec, norma_point point, double *x, double *y);

/** ¿Este tipo es una puerta? (`door`, `door_double`, `door_garage`). */
int norma_object_is_door(const char *type);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_OBJECT_H */
