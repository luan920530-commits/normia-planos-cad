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
    /* "wall", "door", "cad_caf_counter_pickup", "iso_e001"…: el nombre más largo
       del catálogo son 24 caracteres, así que el tipo tiene que caber entero. */
    char type[48];
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
    /** Bisagra al otro lado del vano y abatimiento invertido (inspector web). */
    int flip_x;
    int flip_y;
    /** 0–1. 1 es opaco: el mismo valor que el inspector del editor web. */
    double opacity;
    /** Tamaño de letra del texto en centímetros (`fontSize` en la web). */
    double font_size;
    /** Bloqueado: se puede elegir para desbloquearlo, pero no moverlo ni editarlo. */
    int locked;
    /**
     * Color propio del elemento (`#rrggbb`), el que elige la persona en el
     * inspector. Vacío = el de su familia en el catálogo, que es como se han
     * dibujado siempre los equipos y las señales.
     */
    char colour[16];
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
    /* ---- red de tubería (MEP): la misma ficha del inspector web ---- */
    /** Clave de la red declarada (`agua_fria`, `gas`, `aguas_negras`…). */
    char mep_network[24];
    /** Diámetro nominal tal como lo escribe el catálogo (`1/2"`, `4"`…). */
    char mep_diameter[16];
    /** Material de referencia (`pvc`, `cpvc`, `acero`, `cobre`…). */
    char mep_material[24];
    /** Pendiente de diseño en por ciento; 0 = sin declarar. */
    double mep_slope;
    /** Presión de trabajo en kPa; 0 = sin declarar. */
    double mep_pressure;
    /* ---- circuito eléctrico ---- */
    /** Código del circuito (`C1`, `TA-2`…): los tramos del mismo código son uno. */
    char circuit[16];
    /** Tensión en voltios (110, 220, 440); 0 = sin declarar. */
    int circuit_voltage;
    /** Calibre del conductor en AWG (`14`, `12`, `10`…). */
    char circuit_gauge[16];
    /** Fases: 1 o 3. */
    int circuit_phases;
    /** Carga declarada del tramo o del equipo, en VA. */
    double circuit_load_va;
    /** Carriles declarados de la vía (1–6); 0 = sin declarar. */
    int lanes;
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

/* --------------------------- imagen de guía ------------------------------ */

/** Tope del base64 de la maqueta: 48 MB, o sea unos 36 MB de imagen. */
#define NORMA_GUIDE_MAX_DATA (48u * 1024u * 1024u)

/**
 * La maqueta de trazo: una imagen de fondo para calcar el plano.
 *
 * Se guarda **dentro** del archivo del plano en base64 (`data`), así que el
 * plano sigue siendo un solo archivo y quien lo abra ve la misma guía. La caja
 * va en centímetros del plano y la opacidad de 0 a 1. No se imprime ni sale en
 * el SVG: es una ayuda de dibujo.
 */
typedef struct {
    char name[128];
    char *data;      /* base64 del PNG o JPEG; NULL si no hay guía */
    size_t data_size;
    double opacity;
    double x;
    double y;
    double w;
    double h;
    int visible;
    int locked;
    int present;
} norma_guide;

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
    /** Maqueta de trazo que se ve detrás del plano (ver `norma_document_set_guide`). */
    norma_guide guide;
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

/**
 * Cambia la caja de un elemento (x, y, ancho y alto, en centímetros).
 * Solo vale para elementos con caja: un trazo se mueve nodo a nodo.
 * Devuelve 1 si cambió algo.
 */
int norma_document_set_box(norma_document *document, size_t element, double x, double y, double w, double h);

/** Gira un elemento con caja (grados). Devuelve 1 si cambió. */
int norma_document_set_rotation(norma_document *document, size_t element, double degrees);

/** Grosor del trazo en centímetros (0 o más). Devuelve 1 si cambió. */
int norma_document_set_stroke(norma_document *document, size_t element, double stroke);

/**
 * Color propio del elemento. Con `NULL` o `""` vuelve al de su familia.
 * Solo acepta `#rrggbb`; cualquier otra cosa deja el elemento como estaba.
 */
int norma_document_set_colour(norma_document *document, size_t element, const char *colour);

/** Rótulo del elemento (el nombre que se lee en el plano). `""` lo quita. */
int norma_document_set_label(norma_document *document, size_t element, const char *label);

/** Capa del elemento. `NULL` o `""` no cambia nada. */
int norma_document_set_layer(norma_document *document, size_t element, const char *layer);

/** Capa activa: la que reciben los elementos nuevos. */
int norma_document_set_current_layer(norma_document *document, const char *layer);

/**
 * Elementos de dibujo que no son trazos libres: `line`, `rect` y `ellipse`.
 * Nacen de dos esquinas, con el color y el grosor de la herramienta.
 * Devuelve el índice o -1 si el tipo no es uno de esos.
 */
long norma_document_add_shape(norma_document *document, const char *type, norma_point a, norma_point b,
                              const char *layer);

/**
 * Elementos del entorno que no salen del catálogo, como en el editor web:
 * `road` (vía), `sidewalk` (andén), `crosswalk` (paso peatonal), `parking`
 * (parqueadero) y `property` (lindero); y las instalaciones `pipe` (tubería) y
 * `conduit` (canaleta).
 *
 * Vías, andenes, pasos y parqueaderos nacen de dos esquinas y se guardan como
 * caja; linderos, tuberías y canaletas se guardan por sus dos nodos, con el
 * grosor de su oficio. Devuelve el índice o -1 si el tipo no es de entorno.
 */
long norma_document_add_environment(norma_document *document, const char *type, norma_point a,
                                    norma_point b, const char *layer);

/** 1 si el tipo es uno de los elementos de entorno de arriba. */
int norma_environment_is(const char *type);

/** Texto suelto en el plano: nace con su caja y su contenido. */
long norma_document_add_text(norma_document *document, norma_point origin, double width, double height,
                             const char *text, const char *layer);

/** Copia un elemento desplazado 20 cm y lo deja encima. Devuelve su índice o -1. */
long norma_document_duplicate(norma_document *document, size_t element);

/** Opacidad del elemento, de 0.1 a 1 (el rango del inspector web). Devuelve 1 si cambió. */
int norma_document_set_opacity(norma_document *document, size_t element, double opacity);

/** Tamaño de letra de un texto, en centímetros. Devuelve 1 si cambió. */
int norma_document_set_font_size(norma_document *document, size_t element, double size);

/**
 * Bisagra y abatimiento de una puerta: `flip_x` voltea el lado del vano y
 * `flip_y` invierte el sentido respecto al muro. Devuelve 1 si cambió algo.
 */
int norma_document_set_door_flips(norma_document *document, size_t element, int flip_x, int flip_y);

/**
 * Bloquea o desbloquea el elemento. Mientras está bloqueado, los demás
 * setters y los movimientos no lo tocan; este sí, para poder liberarlo.
 */
int norma_document_set_locked(norma_document *document, size_t element, int locked);

/**
 * Convierte el elemento a otro tipo de la misma familia de dibujo
 * (`wall`, `line`, `rect`, `ellipse`, `text`, `route`, `dimension`), como el
 * «Tipo de elemento» del inspector web: conserva posición, giro y capa.
 * Devuelve 1 si cambió.
 */
int norma_document_set_type(norma_document *document, size_t element, const char *type);

/** Ancho declarado del elemento del entorno, en metros (vía y andén). */
int norma_document_set_width_m(norma_document *document, size_t element, double width_m);

/**
 * Ficha de extintor: agente, clasificación, riesgo, capacidad y altura de
 * montaje. Los valores vacíos o en cero dejan el campo como estaba.
 * Devuelve 1 si cambió algo.
 */
int norma_document_set_extinguisher(norma_document *document, size_t element, const char *agent,
                                    const char *rating, const char *hazard, double capacity_lb,
                                    double mount_cm);

/**
 * Red de la tubería: clave de red, diámetro, material, pendiente (%) y presión
 * (kPa). Solo vale en un `pipe`; los textos vacíos no tocan el campo y un
 * negativo en la pendiente o en la presión deja ese valor como estaba.
 * Devuelve 1 si cambió algo.
 */
int norma_document_set_mep(norma_document *document, size_t element, const char *network,
                           const char *diameter, const char *material, double slope, double pressure);

/**
 * Circuito eléctrico: código, tensión (V), calibre (AWG), fases (1 o 3) y carga
 * (VA). Solo vale en un `conduit`; una carga negativa deja la que hubiera.
 * Devuelve 1 si cambió algo.
 */
int norma_document_set_circuit(norma_document *document, size_t element, const char *code,
                               int voltage, const char *gauge, int phases, double load_va);

/** Carriles declarados de una vía (1–6). Devuelve 1 si cambió. */
int norma_document_set_lanes(norma_document *document, size_t element, int lanes);

/** Pone la guía con su imagen ya codificada en base64 y la caja en centímetros. */
int norma_document_set_guide(norma_document *document, const char *name, const char *data,
                             double x, double y, double w, double h);

/** Opacidad de la guía (0.05–1). Devuelve 1 si cambió. */
int norma_document_set_guide_opacity(norma_document *document, double opacity);

/** Caja de la guía en centímetros. Devuelve 1 si cambió. */
int norma_document_set_guide_box(norma_document *document, double x, double y, double w, double h);

/** Muestra u oculta la guía sin perderla. Devuelve 1 si cambió. */
int norma_document_set_guide_visible(norma_document *document, int visible);

/** Bloquea la guía: se dibuja, pero el lienzo no la mueve. Devuelve 1 si cambió. */
int norma_document_set_guide_locked(norma_document *document, int locked);

/** Quita la guía y libera su imagen. Devuelve 1 si había alguna. */
int norma_document_clear_guide(norma_document *document);

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
