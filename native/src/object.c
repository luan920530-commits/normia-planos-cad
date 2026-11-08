/*
 * Normia nativo · catálogo de objetos insertables.
 *
 * Solo dice **qué** se puede insertar y **cómo nace**. Lo que el objeto mide de
 * verdad lo decide el auditor cuando mide el plano: aquí no hay ni un umbral.
 */
#include "normia/object.h"

#include <string.h>

/**
 * El orden es el del menú Insertar: primero lo que cierra el recinto (puertas),
 * después lo que se revisa (equipos) y al final la señalización.
 *
 * `cad_eds_extinguisher` nace sin datos de norma a propósito: el análisis los
 * completa con `catalogDefaults` de `resources/extinguisher-criteria.json`, así
 * que un extintor insertado aquí y uno insertado en la web se miden igual.
 */
static const norma_object_spec kObjects[NORMA_OBJECT_COUNT] = {
    {"door", "Puerta sencilla", 90.0, 90.0, 2.0, 1, 1},
    {"door_double", "Puerta doble", 120.0, 60.0, 2.0, 1, 1},
    {"door_garage", "Portón o reja", 160.0, 50.0, 2.0, 1, 1},
    {"cad_eds_extinguisher", "Extintor", 90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_firstaid", "Botiquín", 90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_stretcher", "Camilla", 90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_aed", "DEA", 90.0, 90.0, 1.5, 0, 0},
    {"cad_emg_meeting", "Punto de encuentro", 90.0, 90.0, 1.5, 0, 0},
    {"iso_e001", "Señal de salida (E001)", 90.0, 90.0, 1.5, 0, 0},
    {"iso_e007", "Señal de punto de encuentro (E007)", 90.0, 90.0, 1.5, 0, 0},
    {"sig_aqui", "Usted está aquí", 90.0, 90.0, 1.5, 0, 0},
};

size_t norma_object_count(void)
{
    return NORMA_OBJECT_COUNT;
}

const norma_object_spec *norma_object_at(size_t index)
{
    return index < NORMA_OBJECT_COUNT ? &kObjects[index] : NULL;
}

int norma_object_is_door(const char *type)
{
    if (type == NULL) {
        return 0;
    }
    return strcmp(type, "door") == 0 || strcmp(type, "door_double") == 0
           || strcmp(type, "door_garage") == 0;
}

const norma_object_spec *norma_object_find(const char *type)
{
    if (type == NULL) {
        return NULL;
    }
    for (size_t index = 0; index < NORMA_OBJECT_COUNT; index += 1) {
        if (strcmp(kObjects[index].type, type) == 0) {
            return &kObjects[index];
        }
    }
    return NULL;
}

void norma_object_place(const norma_object_spec *spec, norma_point point, double *x, double *y)
{
    if (spec == NULL || x == NULL || y == NULL) {
        return;
    }
    *x = point.x - spec->width / 2.0;
    /* La puerta apoya su borde inferior en el muro: la caja queda hacia arriba,
       que es hacia donde abre la hoja y donde el auditor busca el vano. */
    *y = spec->on_wall ? point.y - spec->height : point.y - spec->height / 2.0;
}
