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
#include <string.h>

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

/* ------------------------------- salidas --------------------------------- */

void norma_egress_criteria_default(norma_egress_criteria *criteria)
{
    if (criteria == NULL) {
        return;
    }
    criteria->max_travel_m = 30.0;
    criteria->min_exit_count = 2;
    criteria->min_exit_width_cm = 80.0;
    criteria->door_clearance_factor = 0.9;
    criteria->width_mm_per_person = 5.0;
    criteria->travel_speed_mps = 1.0;
    criteria->flow_persons_per_second_per_meter = 1.3;
    criteria->min_room_area_m2 = 2.0;
}

/** Redondeo de la app con el número de decimales que usa cada cifra. */
static double round_to(double value, double decimals)
{
    const double factor = pow(10.0, decimals);
    return round(value * factor) / factor;
}

/**
 * Ancho del vano en centímetros: primero la medida declarada y, si no hay, la
 * geometría dibujada (`w`), como en `ElementMeasure`.
 */
static double door_width_cm(const norma_element *element)
{
    if (element->measured_m > 0.0) {
        return round_to(element->measured_m * 100.0, 6.0);
    }
    return element->w > 0.0 ? element->w : 0.0;
}

static int is_door_type(const char *type)
{
    return strcmp(type, "door") == 0 || strcmp(type, "door_double") == 0
           || strcmp(type, "door_garage") == 0;
}

void norma_audit_egress(const norma_document *document, long people, double longest_m,
                        const norma_egress_criteria *criteria, norma_egress *egress)
{
    if (egress == NULL) {
        return;
    }
    norma_egress_criteria defaults;
    if (criteria == NULL) {
        norma_egress_criteria_default(&defaults);
        criteria = &defaults;
    }
    memset(egress, 0, sizeof(*egress));
    egress->walk_time_s = -1.0;
    egress->queue_time_s = -1.0;
    egress->estimated_time_s = -1.0;
    egress->speed_mps = criteria->travel_speed_mps > 0.1 ? criteria->travel_speed_mps : 0.1;
    if (document == NULL) {
        return;
    }

    const double meters_per_unit = norma_meters_per_unit(NORMA_UNIT_CM);
    double width_sum_m = 0.0;
    for (size_t index = 0; index < document->count; index += 1) {
        const norma_element *element = &document->elements[index];
        if (!is_door_type(element->type)) {
            continue;
        }
        egress->door_count += 1;
        if (!element->is_exit) {
            continue;
        }
        egress->exit_count += 1;
        width_sum_m += round_to(door_width_cm(element) * meters_per_unit, 2.0);
    }
    egress->exit_width_m = round_to(width_sum_m, 2.0);
    egress->available_width_m = round_to(egress->exit_width_m * criteria->door_clearance_factor, 2.0);
    egress->required_width_m = round_to((double) people * criteria->width_mm_per_person / 1000.0, 2.0);

    const long walkable = people > 0 ? people : 0;
    if (longest_m >= 0.0) {
        egress->walk_time_s = round_to(longest_m / egress->speed_mps, 1.0);
    }
    const double flow = criteria->flow_persons_per_second_per_meter > 0.0
                            ? criteria->flow_persons_per_second_per_meter
                            : 0.0;
    if (egress->available_width_m > 0.0 && flow > 0.0) {
        egress->queue_time_s = round_to((double) walkable / (flow * egress->available_width_m), 1.0);
    }
    if (egress->walk_time_s >= 0.0 && egress->queue_time_s >= 0.0) {
        egress->estimated_time_s = round_to(egress->walk_time_s + egress->queue_time_s, 1.0);
    }
}
