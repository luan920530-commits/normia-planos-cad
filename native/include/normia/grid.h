/*
 * Normia nativo · rejilla de cálculo del plano.
 *
 * Espejo de `App\Services\PlanGrid` (PHP). Convierte el lienzo en celdas
 * cuadradas, bloquea los muros con su holgura, libera los vanos de las puertas
 * y separa el exterior del piso útil, para que el aforo y el auditor midan
 * sobre el mismo espacio libre que la edición web.
 *
 * Reglas, las mismas del original:
 *   1. La geometría está en centímetros; la unidad del lienzo es una etiqueta.
 *   2. La celda nunca baja de 5 cm y se agranda ×1,5 si el plano pasa del tope
 *      de celdas (`max_cells`), para no comer memoria sin avisar.
 *   3. Un muro bloquea medio trazo más la holgura más media celda: así un muro
 *      fino no cae justo entre dos centros de celda y desaparece del cálculo.
 *   4. El exterior se inunda desde el borde con los vanos cerrados; si no hay
 *      recinto cerrado, se analiza el lienzo completo.
 *   5. Vías, andenes, cebras, parqueaderos y linderos son referencia del
 *      entorno: no bloquean el tránsito, pero no cuentan como área útil.
 */
#ifndef NORMA_GRID_H
#define NORMA_GRID_H

#include <stddef.h>

#include "normia/document.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Criterios de la rejilla: los mismos valores por omisión del auditor. */
typedef struct {
    /** Lado de la celda en centímetros (mínimo 5). */
    double cell_cm;
    /** Holgura alrededor de los muros, en centímetros. */
    double clearance_cm;
    /** Tope de celdas antes de agrandar la celda. */
    long max_cells;
} norma_grid_criteria;

/** Los criterios de referencia de la aplicación (20 cm · 4 cm · 120 000). */
void norma_grid_criteria_default(norma_grid_criteria *criteria);

typedef struct {
    double width;
    double height;
    /** Lado de la celda en unidades del lienzo. */
    double cell;
    /** Lado de la celda en metros. */
    double cell_m;
    double cell_area_m2;
    double clearance;
    size_t nx;
    size_t ny;
    /** Una marca por celda: 1 = muro u obstáculo. */
    unsigned char *blocked;
    /** Una marca por celda: 1 = fuera del piso útil. */
    unsigned char *exterior;
    /** Superficie libre del piso, en metros cuadrados (sin redondear). */
    double free_area_m2;
    /** Superficie exterior descontada, en metros cuadrados. */
    double exterior_area_m2;
} norma_grid;

/**
 * Puntos del trazo de un elemento con los arcos resueltos y el giro aplicado,
 * igual que `PlanGrid::visualPoints` en la web. El llamador libera con `free`.
 * Devuelve 1 si hay al menos dos puntos.
 */
int norma_grid_visual_points(const norma_element *element, norma_point **points, size_t *count);

/**
 * Arma la rejilla del documento. Devuelve 1 si la construyó y 0 si no hay
 * lienzo o memoria. El llamador libera con `norma_grid_free`.
 */
int norma_grid_build(const norma_document *document, const norma_grid_criteria *criteria,
                     norma_grid *grid, char *error, size_t error_size);

void norma_grid_free(norma_grid *grid);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_GRID_H */
