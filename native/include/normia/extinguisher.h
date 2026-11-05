/*
 * Normia nativo · cobertura de extintores.
 *
 * Espejo de `ExtinguisherCoverage::analyze()` y de las tablas de
 * `ExtinguisherNorms`: mide, sobre la misma rejilla libre del auditor, qué
 * superficie alcanza cada extintor **siguiendo el recorrido real** (ocho
 * vecinos, no la línea recta) y con dos criterios a la vez:
 *
 *   1. recorrido máximo según la clase de fuego y el riesgo (NTC 2885 / NFPA 10);
 *   2. área máxima que puede asignarse según la clasificación del equipo.
 *
 * Las tablas viven en `resources/extinguisher-criteria.json` y se leen en
 * tiempo de ejecución: son las mismas de la edición web, con las dos columnas
 * juntas (Colombia · NTC 2885 + Resolución 2400, e internacional · NFPA 10).
 *
 * El resultado es un **apoyo de diseño**: dice si el equipo dibujado alcanza el
 * piso con esos criterios, no si el extintor existe, está cargado, vigente ni
 * rotulado. Eso se verifica en sitio y el texto del hallazgo lo dice.
 */
#ifndef NORMA_EXTINGUISHER_H
#define NORMA_EXTINGUISHER_H

#include <stddef.h>

#include "normia/document.h"
#include "normia/findings.h"
#include "normia/grid.h"
#include "normia/json.h"
#include "normia/library.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Clases de fuego, como juego de bits. */
#define NORMA_FIRE_A 1
#define NORMA_FIRE_B 2
#define NORMA_FIRE_C 4
#define NORMA_FIRE_D 8
#define NORMA_FIRE_K 16

/** Tope de equipos y de zonas que se publican. */
#define NORMA_EXT_MAX_UNITS 32
#define NORMA_EXT_MAX_ZONES 24

/** Tablas normativas cargadas del catálogo local. */
typedef struct {
    norma_json *root;
    /** Perfil efectivo (`colombia`, `nfpa10`…) y riesgo predominante. */
    char profile[24];
    char hazard[16];
} norma_ext_norms;

/**
 * Lee `extinguisher-criteria.json` de la carpeta de catálogos.
 * `profile` y `hazard` pueden venir vacíos: se usan los del plano o los de la
 * tabla. Devuelve 1 si cargó, 0 y el motivo si no.
 */
int norma_ext_norms_load(const char *resources, const char *profile, const char *hazard,
                         norma_ext_norms *norms, char *error, size_t error_size);

void norma_ext_norms_free(norma_ext_norms *norms);

/** Perfil del catálogo para el plano (o el perfil por omisión de la tabla). */
const char *norma_ext_profile_key(const norma_ext_norms *norms);

/** Etiqueta del riesgo (`Leve`, `Ordinario`, `Extra`). */
const char *norma_ext_hazard_label(const norma_ext_norms *norms, const char *hazard);

/* --------------------------------- medidas --------------------------------- */

/**
 * Lee un rótulo como «2-A:10-B:C»: el mayor número de A, el mayor de B y las
 * clases de fuego que declara (bits `NORMA_FIRE_*`).
 */
void norma_ext_parse_rating(const char *raw, int *rating_a, int *rating_b, int *classes);

typedef struct {
    char id[32];
    char type[24];
    /** Centro del equipo (redondeado a dos decimales, como la web). */
    double cx;
    double cy;
    char agent[24];
    char rating[24];
    char hazard[16];
    char hazard_label[32];
    char agent_label[64];
    double capacity_lb;
    double mount_cm;
    int classes;
    int rating_a;
    int rating_b;
    int has_travel;
    double travel_m;
    int has_area_limit;
    double area_limit_m2;
    int wheeled;
    double mount_max_cm;
    double travel_area_m2;
    int has_max_travel;
    double max_travel_m;
    double coverage_area_m2;
    double coverage_pct;
    double over_area_m2;
    int has_sign_distance;
    double sign_distance_m;
    int sign_covered;
    const char *status;
} norma_ext_unit;

typedef struct {
    double area_m2;
    size_t cells;
    double cx;
    double cy;
    int has_worst;
    double worst_x;
    double worst_y;
    int has_worst_distance;
    double worst_distance_m;
    /** `travel`, `area`, `unreachable` o `no_class`. */
    const char *reason;
    char nearest_ids[8][32];
    size_t nearest_count;
} norma_ext_zone;

typedef struct {
    size_t count;
    double floor_area_m2;
    double covered_area_m2;
    double uncovered_area_m2;
    double covered_pct;
    long required_by_area;
    char hazard_label[32];
    int classes;
    int missing_classes;
    size_t signs;
    double cell_m;
    size_t units_with_gap;
} norma_ext_summary;

typedef struct {
    norma_ext_unit units[NORMA_EXT_MAX_UNITS];
    size_t unit_count;
    norma_ext_zone zones[NORMA_EXT_MAX_ZONES];
    size_t zone_count;
    norma_ext_summary summary;
} norma_ext_result;

/**
 * Calcula la cobertura. `grid` es la rejilla del auditor y `document` el plano.
 * No emite hallazgos: eso lo hace `norma_ext_findings()` con el resultado.
 */
void norma_ext_analyze(const norma_document *document, const norma_grid *grid,
                       const norma_library *library, const norma_ext_norms *norms,
                       norma_ext_result *result);

/** Acciones cuantificadas: qué hacer y cuánta superficie ganaría. */
#define NORMA_EXT_MAX_RECS 4

typedef struct {
    /** `add`, `move` o `upgrade`. */
    char action[12];
    char title[96];
    char detail[512];
    /** Equipo al que se refiere (`move` y `upgrade`); vacío en `add`. */
    char element_id[32];
    /** Equipo sugerido, listo para dibujarlo en el plano. */
    norma_element element;
    int has_element;
    int has_target;
    norma_point target;
    double gain_area_m2;
    int has_gain_pct;
    double gain_pct;
} norma_ext_recommendation;

/**
 * Acciones cuantificadas sobre las zonas descubiertas: añadir un equipo en el
 * punto más desfavorable, reubicar el más cercano o subir la clasificación.
 * La ganancia se mide **volviendo a calcular** la cobertura con el cambio, no
 * se estima a ojo. Devuelve cuántas escribió (como mucho `capacity`).
 */
size_t norma_ext_recommend(const norma_document *document, const norma_grid *grid,
                           const norma_library *library, const norma_ext_norms *norms,
                           const norma_ext_result *result, norma_ext_recommendation *out,
                           size_t room);

/**
 * Hallazgos de extintores, con los textos del auditor web. No los ordena: el
 * llamador ordena la lista completa al final.
 */
void norma_ext_findings(const norma_ext_result *result, const norma_ext_norms *norms,
                        norma_findings *findings);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_EXTINGUISHER_H */
