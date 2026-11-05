/*
 * Normia nativo · aforo (espejo de `PlanAudit::aforoFromArea`).
 *
 * La misma cuenta que la web, con las mismas guardas: sin densidad no se
 * inventa una capacidad, y el aforo declarado que supera el máximo no se
 * recorta en silencio (se informa como exceso y se usa para la salida).
 */
#include "normia/audit.h"

#include <math.h>
#include <stdio.h>

void norma_occupancy_criteria_default(norma_occupancy_criteria *criteria)
{
    if (criteria == NULL) {
        return;
    }
    criteria->density_persons_per_m2 = 0.2;
    criteria->max_persons = 10000;
}

/** Redondeo de la app: dos decimales para las superficies publicadas. */
static double round_meters(double value)
{
    return round(value * 100.0) / 100.0;
}

void norma_audit_aforo_from_area(double free_area_m2, const norma_document *document, long declared,
                                 const norma_occupancy_criteria *criteria, norma_aforo *aforo)
{
    if (aforo == NULL) {
        return;
    }
    norma_occupancy_criteria defaults;
    if (criteria == NULL) {
        norma_occupancy_criteria_default(&defaults);
        criteria = &defaults;
    }
    long declared_persons = declared > 0 ? declared : 0;
    if (declared_persons == 0 && document != NULL && document->occupancy > 0) {
        declared_persons = document->occupancy;
    }
    double density = criteria->density_persons_per_m2 > 0.0 ? criteria->density_persons_per_m2 : 0.0;
    long cap = criteria->max_persons > 1 ? criteria->max_persons : 1;
    double free_area = free_area_m2 > 0.0 ? free_area_m2 : 0.0;

    long max_persons = cap;
    if (density > 0.0) {
        /* `(int) round()` en PHP: se redondea y luego se acota a [1, cap]. */
        const double capacity = round(free_area * density);
        long estimated = (long) capacity;
        if (estimated < 1) {
            estimated = 1;
        }
        max_persons = estimated < cap ? estimated : cap;
    }
    const long permitted = declared_persons > 0
                               ? (declared_persons < max_persons ? declared_persons : max_persons)
                               : max_persons;
    const long used = declared_persons > 0 ? declared_persons : max_persons;
    const long excess = declared_persons > max_persons ? declared_persons - max_persons : 0;

    aforo->max_persons = max_persons;
    aforo->declared = declared_persons;
    aforo->permitted = permitted;
    aforo->used = used;
    aforo->excess = excess;
    aforo->source = declared_persons > 0 ? "declared" : "estimated";
    aforo->free_area_m2 = round_meters(free_area);
    aforo->density = density;
    aforo->cap = cap;
}

int norma_audit_aforo(const norma_document *document, long declared,
                      const norma_occupancy_criteria *criteria, const norma_grid_criteria *grid_criteria,
                      norma_aforo *aforo, norma_grid *grid, char *error, size_t error_size)
{
    if (document == NULL || aforo == NULL || grid == NULL) {
        return 0;
    }
    if (!norma_grid_build(document, grid_criteria, grid, error, error_size)) {
        return 0;
    }
    norma_audit_aforo_from_area(grid->free_area_m2, document, declared, criteria, aforo);
    return 1;
}
