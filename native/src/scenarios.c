/*
 * Normia nativo · escenarios de ocupación temporal.
 *
 * Las cuentas son las de `OccupancyScenarios::analyze()` en la edición web y se
 * comprueban en `native/tests/parity.mjs`: capacidad, exceso, ancho exigido y
 * tiempos salen de la misma superficie libre, la misma densidad y el mismo
 * ancho útil del piso. El escenario no toca el aforo del piso.
 */
#include "normia/scenarios.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "normia/format.h"

/** Redondeo con decimales, hacia el más cercano y alejándose del cero. */
static double round_to(double value, double factor)
{
    return round(value * factor) / factor;
}

/** Cola en las salidas con el ancho útil disponible. `has` = 0 si no aplica. */
static void scenario_queue(long persons, double flow, double available_width_m, int *has, double *seconds)
{
    *has = 0;
    *seconds = 0.0;
    if (persons <= 0 || flow <= 0.0 || available_width_m <= 0.0) {
        return;
    }
    *has = 1;
    *seconds = round_to((double) persons / (flow * available_width_m), 10.0);
}

static void scenario_total(int has_walk, double walk_s, int has_queue, double queue_s, int *has,
                           double *seconds)
{
    *has = 0;
    *seconds = 0.0;
    if (!has_walk || !has_queue) {
        return;
    }
    *has = 1;
    *seconds = round_to(walk_s + queue_s, 10.0);
}

size_t norma_scenarios_analyze(const norma_document *document, const norma_aforo *aforo,
                               const norma_egress *egress, const norma_egress_criteria *criteria,
                               norma_scenario_item *out, size_t room)
{
    if (document == NULL || aforo == NULL || egress == NULL || criteria == NULL || out == NULL
        || room == 0) {
        return 0;
    }
    long capacity = aforo->max_persons;
    if (capacity < 1) {
        capacity = 1;
    }
    const long people = aforo->used > 0 ? aforo->used : capacity;
    const double flow = criteria->flow_persons_per_second_per_meter > 0.0
                            ? criteria->flow_persons_per_second_per_meter
                            : 0.0;
    const double mm_per_person = criteria->width_mm_per_person > 0.0
                                     ? criteria->width_mm_per_person
                                     : 0.0;
    int has_base_queue = 0;
    double base_queue = 0.0;
    scenario_queue(people, flow, egress->available_width_m, &has_base_queue, &base_queue);
    int has_base_time = 0;
    double base_time = 0.0;
    scenario_total(egress->walk_time_s >= 0.0, egress->walk_time_s, has_base_queue, base_queue,
                   &has_base_time, &base_time);

    size_t written = 0;
    for (size_t index = 0; index < document->scenario_count && written < room; index += 1) {
        const norma_scenario *scenario = &document->scenarios[index];
        if (scenario->persons <= 0) {
            continue;
        }
        norma_scenario_item *item = &out[written];
        memset(item, 0, sizeof(*item));
        if (scenario->name[0] != '\0') {
            snprintf(item->name, sizeof(item->name), "%s", scenario->name);
        } else {
            snprintf(item->name, sizeof(item->name), "Escenario sin nombre");
        }
        item->persons = scenario->persons;
        item->capacity = capacity;
        item->excess = scenario->persons > capacity ? scenario->persons - capacity : 0;
        item->fits = scenario->persons <= capacity;
        item->required_width_m =
            round_to((double) scenario->persons * mm_per_person / 1000.0, 100.0);
        item->available_width_m = round_to(egress->available_width_m, 100.0);
        if (egress->available_width_m <= 0.0) {
            item->width_ok = -1;
        } else {
            item->width_ok = item->required_width_m <= item->available_width_m + 0.001 ? 1 : 0;
        }
        int has_queue = 0;
        double queue_s = 0.0;
        scenario_queue(scenario->persons, flow, egress->available_width_m, &has_queue, &queue_s);
        item->has_queue = has_queue;
        item->queue_s = queue_s;
        int has_time = 0;
        double time_s = 0.0;
        scenario_total(egress->walk_time_s >= 0.0, egress->walk_time_s, has_queue, queue_s, &has_time,
                       &time_s);
        item->has_time = has_time;
        item->time_s = time_s;
        if (has_time && has_base_time) {
            item->has_extra = 1;
            item->extra_s = round_to(time_s - base_time, 10.0);
        }
        written += 1;
    }
    return written;
}

/** Los más exigentes primero: personas de mayor a menor y, a igualdad, nombre. */
static void sort_failing(norma_scenario_item *items, size_t count)
{
    for (size_t index = 1; index < count; index += 1) {
        norma_scenario_item current = items[index];
        size_t position = index;
        while (position > 0
               && (items[position - 1].persons < current.persons
                   || (items[position - 1].persons == current.persons
                       && strcmp(items[position - 1].name, current.name) > 0))) {
            items[position] = items[position - 1];
            position -= 1;
        }
        items[position] = current;
    }
}

void norma_scenarios_findings(const norma_scenario_item *items, size_t count,
                              const norma_aforo *aforo, norma_findings *findings)
{
    if (items == NULL || findings == NULL || count == 0) {
        return;
    }
    norma_scenario_item failing[NORMA_MAX_SCENARIOS];
    size_t failing_count = 0;
    for (size_t index = 0; index < count && failing_count < NORMA_MAX_SCENARIOS; index += 1) {
        if (!items[index].fits || items[index].width_ok == 0) {
            failing[failing_count] = items[index];
            failing_count += 1;
        }
    }
    if (failing_count == 0) {
        return;
    }
    sort_failing(failing, failing_count);

    char title[160];
    char detail[640];
    char value[64];
    char density[32];
    char required[32];
    char available[32];
    const double density_value = aforo != NULL ? aforo->density : 0.0;
    norma_format_fixed(density_value, 2, density, sizeof(density));

    const size_t reported =
        failing_count < NORMA_SCENARIO_MAX_REPORTED ? failing_count : NORMA_SCENARIO_MAX_REPORTED;
    for (size_t index = 0; index < reported; index += 1) {
        const norma_scenario_item *item = &failing[index];
        if (!item->fits) {
            snprintf(title, sizeof(title), "Escenario «%.60s» por encima de la capacidad del piso",
                     item->name);
            snprintf(detail, sizeof(detail),
                     "El escenario declara %ld personas y la superficie libre del piso admite %ld "
                     "con la densidad de referencia (%s pers./m²), así que sobran %ld. Un evento "
                     "temporal no amplía la capacidad del recinto: reduce el aforo del evento, "
                     "amplía la superficie útil o tramita el cupo con la autoridad competente.",
                     item->persons, item->capacity, density, item->excess);
            snprintf(value, sizeof(value), "%ld de %ld", item->persons, item->capacity);
            norma_findings_add(findings, "scenario_over_capacity", "medium", title, detail, NULL, 0,
                               NULL, value);
        }
        if (item->width_ok == 0) {
            norma_format_fixed(item->required_width_m, 2, required, sizeof(required));
            norma_format_fixed(item->available_width_m, 2, available, sizeof(available));
            snprintf(title, sizeof(title), "Salidas insuficientes para el escenario «%.60s»",
                     item->name);
            snprintf(detail, sizeof(detail),
                     "Con %ld personas el escenario pide %s m de ancho útil y las salidas marcadas "
                     "suman %s m. Revisa el número de salidas, su ancho libre o el aforo del evento "
                     "antes de montarlo.",
                     item->persons, required, available);
            snprintf(value, sizeof(value), "%s m", required);
            norma_findings_add(findings, "scenario_width_short", "medium", title, detail, NULL, 0,
                               NULL, value);
        }
    }
    if (failing_count > NORMA_SCENARIO_MAX_REPORTED) {
        snprintf(title, sizeof(title), "Otros escenarios revisados");
        snprintf(detail, sizeof(detail),
                 "Se revisaron %zu escenarios y %zu se pasan de la capacidad o del ancho útil. "
                 "Arriba están los %d más exigentes; el informe completo los lista todos.",
                 count, failing_count, NORMA_SCENARIO_MAX_REPORTED);
        snprintf(value, sizeof(value), "%zu de %zu", failing_count, count);
        norma_findings_add(findings, "scenario_more", "info", title, detail, NULL, 0, NULL, value);
    }
}
