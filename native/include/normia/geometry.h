/*
 * Normia nativo · geometría de trazos.
 *
 * Espejo de `App\Services\PathGeometry` (PHP): el arco se guarda como tres
 * puntos —inicio, paso y fin— y de ahí sale el círculo, el barrido y la
 * longitud real del arco. La longitud de un tramo curvo es `r · barrido`, no la
 * cuerda: es la corrección que se aprobó en la etapa 0 de NORMIA-004 y la cifra
 * que la prueba de paridad compara contra PHP.
 *
 * Las guardas (tramos rectos, degenerados, radios absurdos) son las mismas.
 */
#ifndef NORMA_GEOMETRY_H
#define NORMA_GEOMETRY_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    double x;
    double y;
} norma_point;

typedef struct {
    /** 0 si el tramo es recto o degenerado: entonces manda la cuerda. */
    int valid;
    double cx;
    double cy;
    double r;
    double start;
    double sweep;
    double sagitta;
    /** +1 si el arco va en sentido positivo, -1 si va al revés. */
    int direction;
    /** Longitud real del arco: `r · sweep`. */
    double length;
} norma_arc;

/** Distancia entre dos puntos. */
double norma_distance(norma_point a, norma_point b);

/** Punto medio. */
norma_point norma_midpoint(norma_point a, norma_point b);

/** Distancia de un punto a un segmento (la usan las pruebas de los muros). */
double norma_point_segment_distance(norma_point p, norma_point a, norma_point b);

/** Arco de tres puntos. `valid = 0` cuando el tramo es recto o degenerado. */
norma_arc norma_arc_from_points(norma_point a, norma_point through, norma_point b);

/** Punto del arco en el parámetro `t` (0 = inicio, 1 = fin), recortado a [0, 1]. */
norma_point norma_arc_point_at(const norma_arc *arc, double t);

/**
 * Longitud de una polilínea con arcos opcionales.
 *
 * `arcs` puede ser `NULL`; si no, necesita `count - 1` entradas, una por tramo,
 * y cada una con `valid` a 1 para que se use el arco en vez de la cuerda. Es la
 * misma forma que `curves` en el plano.
 */
double norma_polyline_length(const norma_point *points, size_t count, const norma_arc *arcs);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_GEOMETRY_H */
