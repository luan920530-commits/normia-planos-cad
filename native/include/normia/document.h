/*
 * Normia nativo · documento del plano.
 *
 * El modelo que la ventana nativa va a editar: lienzo, elementos (muros con
 * nodos y arcos, señales y equipos), deshacer y rehacer, selección por
 * proximidad y guardado en el sobre oficial.
 *
 * Todo está en **centímetros**, igual que en el editor web: la unidad
 * declarada solo cambia cómo se leen las cifras, nunca las coordenadas.
 *
 * No depende de ninguna interfaz gráfica; la ventana de macOS lo usa tal cual.
 */
#ifndef NORMA_DOCUMENT_H
#define NORMA_DOCUMENT_H

#include <stddef.h>

#include "normia/geometry.h"
#include "normia/units.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Nodos máximos de un trazo (el editor web no impone tope, pero esto es un tope sano). */
#define NORMA_MAX_NODES 128

/** Niveles de deshacer que se conservan. */
#define NORMA_MAX_UNDO 64

typedef struct {
    char id[32];
    char type[24];   /* "wall", "sign", "extinguisher"… */
    char layer[32];
    /** Nombre que la persona le puso al objeto (vacío si no tiene). */
    char label[64];
    norma_point nodes[NORMA_MAX_NODES];
    norma_arc arcs[NORMA_MAX_NODES > 1 ? NORMA_MAX_NODES - 1 : 1];
    size_t node_count;
    /* Caja del elemento: la usan puertas y elementos del entorno (vías,
       andenes, parqueaderos y linderos), igual que en la web. */
    double x;
    double y;
    double w;
    double h;
    double rotation;
    /** Grosor del trazo en centímetros: el auditor bloquea medio trazo a cada lado. */
    double stroke;
    /** Ancho declarado del elemento del entorno, en metros (andenes y vías). */
    double width_m;
    /** Medida declarada por la persona, en metros (NORMIA-006 §6.1). */
    double measured_m;
    /** Puerta marcada como salida de emergencia. */
    int is_exit;
    /* Datos de norma de un extintor (NTC 2885 / NFPA 10). Se guardan tal como
       vienen del plano: los valores que falten los completa el análisis con los
       del catálogo, igual que `DesignValidator::extinguisherFields()` en la web. */
    char ext_agent[24];
    char ext_rating[24];
    char ext_hazard[16];
    double ext_capacity_lb;
    double ext_mount_cm;
    /** 1 si el plano declaró la altura de montaje (0 cm es «sin dato»). */
    int has_ext_mount;
} norma_element;

typedef struct {
    norma_element *items;
    size_t count;
} norma_snapshot;

/** Tope de escenarios de ocupación temporal por piso (el del validador web). */
#define NORMA_MAX_SCENARIOS 8

/**
 * Escenario de ocupación temporal declarado en el lienzo (`canvas.scenarios`):
 * una feria, una capacitación, la hora pico. No cambia el aforo del piso; se
 * revisa aparte, con la misma superficie y el mismo ancho útil.
 */
typedef struct {
    char name[64];
    long persons;
} norma_scenario;

typedef struct {
    double width;
    double height;
    norma_unit unit;
    char scale[16];
    char layer[32];
    /** Ocupación declarada del plano (personas). 0 = sin declarar. */
    long occupancy;
    /** Ajustes de extintores del plano: perfil normativo y riesgo predominante. */
    char ext_profile[24];
    char ext_hazard[16];
    /**
     * Simulacro: tiempo de reacción declarado en segundos (30 si no se dice) y
     * tiempo medido en un simulacro real (0 = no se midió). Son dos cosas
     * distintas: uno se declara, el otro se cronometra.
     */
    long drill_reaction_s;
    long drill_measured_s;
    /** Escenarios de ocupación temporal declarados (0 = ninguno). */
    norma_scenario scenarios[NORMA_MAX_SCENARIOS];
    size_t scenario_count;
    norma_element *elements;
    size_t count;
    size_t capacity;
    int identifier;
    norma_snapshot undo[NORMA_MAX_UNDO];
    size_t undo_count;
    norma_snapshot redo[NORMA_MAX_UNDO];
    size_t redo_count;
    int dirty;
} norma_document;

/** Documento nuevo: A4 horizontal a 1:100 en centímetros, como el estudio. */
void norma_document_init(norma_document *document);

/** Documento con un lienzo concreto. */
void norma_document_init_with(norma_document *document, double width, double height, norma_unit unit, const char *scale);

void norma_document_free(norma_document *document);

/** Vacía los elementos y el historial. */
void norma_document_clear(norma_document *document);

/**
 * Marca el comienzo de una edición: guarda el estado para poder deshacerla.
 * Llamarlo antes de añadir, mover o borrar.
 */
void norma_document_begin_edit(norma_document *document);

/**
 * Añade un muro o trazo por sus nodos.
 *
 * `through` puede ser `NULL`; si no, necesita `count - 1` entradas y cada una
 * con `valid` a 1 para que ese tramo sea un arco. Devuelve el índice del
 * elemento o -1 si no cabe.
 */
long norma_document_add_wall(norma_document *document, const norma_point *nodes, size_t count,
                             const norma_arc *through, const char *layer);

/**
 * Añade una cota entre dos puntos. La cifra que se rotula la calcula el núcleo
 * con la unidad del plano: nunca se escribe a mano en el modelo.
 */
long norma_document_add_dimension(norma_document *document, norma_point a, norma_point b, const char *layer);

/**
 * Añade una **ruta de evacuación** por sus nodos (herramienta Ruta).
 *
 * La ruta se guarda como un trazo de tipo `route` con el grosor de la
 * herramienta; el auditor la mide y dice si llega a una salida y cuántas veces
 * cruza un muro.
 */
long norma_document_add_route(norma_document *document, const norma_point *nodes, size_t count,
                              const norma_arc *through, const char *layer);

/** Añade una señal o un equipo en un punto (sin caja: el punto es el centro). Devuelve el índice o -1. */
long norma_document_add_marker(norma_document *document, const char *type, double x, double y, const char *layer);

/**
 * Añade un objeto del catálogo (`norma/object.h`) donde se hizo clic: una
 * puerta apoya su caja en el muro y un equipo o una señal se centran en el
 * punto. Devuelve el índice o -1 si el tipo no se puede insertar.
 */
long norma_document_add_object(norma_document *document, const char *type, norma_point point,
                               const char *layer);

/**
 * Marca o desmarca una puerta como salida de emergencia.
 * Devuelve 1 si cambió y 0 si no (no es una puerta, o ya estaba así).
 */
int norma_document_set_exit(norma_document *document, size_t element, int is_exit);

/**
 * Mueve una caja (puerta, equipo, señal) llevando su esquina a `x`, `y`.
 * Los trazos se mueven nodo a nodo con `norma_document_move_node`.
 */
int norma_document_move_object(norma_document *document, size_t element, double x, double y);

/** Mueve un nodo de un trazo. Devuelve 1 si se movió. */
int norma_document_move_node(norma_document *document, size_t element, size_t node, double x, double y);

/** Borra un elemento. Devuelve 1 si se borró. */
int norma_document_remove(norma_document *document, size_t element);

/** Deshace la última edición. Devuelve 1 si había algo que deshacer. */
int norma_document_undo(norma_document *document);

/** Rehace. Devuelve 1 si había algo que rehacer. */
int norma_document_redo(norma_document *document);

/**
 * Elemento más cercano a un punto, dentro de la tolerancia.
 * Devuelve el índice o -1 si no hay nada cerca.
 */
long norma_document_hit_test(const norma_document *document, norma_point point, double tolerance);

/** Longitud total de los trazos en centímetros (arcos incluidos). */
double norma_document_length_cm(const norma_document *document);

/** Longitud total en metros. */
double norma_document_length_m(const norma_document *document);

/** Guarda el plano en el sobre oficial (`normia-plan`, esquema 3). Devuelve el texto; libéralo con `free`. */
char *norma_document_to_json(const norma_document *document, const char *name);

/** Carga un sobre oficial o un diseño suelto. Devuelve 1 si se pudo. */
int norma_document_from_json(norma_document *document, const char *text, size_t length, char *error, size_t error_size);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_DOCUMENT_H */
