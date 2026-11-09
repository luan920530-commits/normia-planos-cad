/*
 * Normia nativo · dibujo de los pictogramas SVG del catálogo.
 *
 * Las 395 señales y los 422 objetos CAD son SVG: la web los incrusta y el SVG
 * y el PDF exportados los llevan tal cual. La ventana, en cambio, solo pintaba
 * un marco y el nombre, así que los diseños no se veían.
 *
 * Este archivo lee el **subconjunto de SVG** que usan los catálogos y lo
 * traduce a llamadas de dibujo abstractas (mover, línea, curva, cerrar y
 * pintar). Quien dibuja pone el destino: Core Graphics en la ventana, un
 * contexto de mapa de bits para las miniaturas, o un contador en las pruebas.
 * Como el intérprete vive en el núcleo, la misma ruta sirve para la ventana de
 * macOS, para una futura ventana de Windows o Linux y para las pruebas.
 *
 * Lo que se admite —y está en los catálogos— es:
 *
 *   · formas: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`;
 *   · estructura: `svg` anidado, `g`, `defs`, `use` con `xlink:href`, `clipPath`;
 *   · comandos de `path`: M L H V C S Q T A Z, en mayúsculas (absolutos) y
 *     minúsculas (relativos);
 *   · `transform`: `matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`;
 *   · presentación: `fill`, `stroke`, `stroke-width`, `fill-opacity`,
 *     `stroke-opacity`, `opacity`, `fill-rule`, `stroke-dasharray`, `color`,
 *     `currentColor`, y las mismas claves dentro de `style="…"`.
 *
 * Lo que se ignora a propósito: filtros, degradados, imágenes y animación.
 * Ninguno aparece en los catálogos; si apareciera, el pictograma se dibuja sin
 * esa capa en vez de fallar. El `<text>` sí se dibuja, porque tres piezas del
 * catálogo lo usan para su rótulo: la «P» del parqueadero, la «E» del
 * estacionamiento exclusivo y el «30» de la señal de velocidad.
 */
#ifndef NORMA_SVG_DRAW_H
#define NORMA_SVG_DRAW_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Lo que necesita quien dibuja para pintar el camino acumulado. */
typedef struct {
    /** Relleno `#rrggbb`, o `NULL` si el elemento no se rellena. */
    const char *fill;
    /** Opacidad del relleno, 0–1. */
    double fill_alpha;
    /** 1 si el relleno usa la regla par-impar (`fill-rule="evenodd"`). */
    int even_odd;
    /** Trazo `#rrggbb`, o `NULL` si el elemento no se traza. */
    const char *stroke;
    double stroke_alpha;
    /** Grosor del trazo ya escalado a la medida del plano, en centímetros. */
    double stroke_width;
    /** `stroke-dasharray` tal como viene (`"12 5"` o `NULL`), y su desfase. */
    const char *dash;
    double dash_offset;
} norma_svg_paint;

/** Alineación horizontal de un rótulo, como `text-anchor`. */
enum {
    NORMA_SVG_TEXT_START = 0,
    NORMA_SVG_TEXT_MIDDLE = 1,
    NORMA_SVG_TEXT_END = 2
};

/**
 * Destino del dibujo.
 *
 * El camino se va acumulando con `move_to`, `line_to`, `curve_to` y `close`, y
 * `paint` lo pinta **y lo vacía**. `paint` llega una vez por figura terminada,
 * también cuando no hay nada que pintar (`fill` y `stroke` a `NULL`, por
 * ejemplo un `fill:none`): en ese caso solo hay que descartar el camino, y
 * hacerlo es obligatorio, porque si no la figura se pegaría a la siguiente.
 * `push_clip` toma el camino acumulado como recorte de lo que venga después, y
 * `pop_clip` lo devuelve.
 */
typedef struct {
    void *user;
    void (*move_to)(void *user, double x, double y);
    void (*line_to)(void *user, double x, double y);
    /** Bézier cúbica: dos puntos de control y el destino. */
    void (*curve_to)(void *user, double x1, double y1, double x2, double y2, double x3, double y3);
    void (*close)(void *user);
    void (*paint)(void *user, const norma_svg_paint *paint);
    void (*push_clip)(void *user);
    void (*pop_clip)(void *user);
    /**
     * Un rótulo del pictograma (`<text>`). `x` e `y` son la línea base en
     * coordenadas del plano, `size` el cuerpo de letra ya escalado y `anchor`
     * uno de los `NORMA_SVG_TEXT_*`. Puede ser `NULL`: entonces el rótulo no se
     * dibuja, como pasaba antes de admitirlo.
     */
    void (*text)(void *user, double x, double y, double size, int anchor, const char *fill,
                 double alpha, const char *content);
} norma_svg_sink;

/**
 * Dibuja el pictograma `svg` en la caja (x, y, w, h) del plano.
 *
 * `colour` es el color que reciben los `currentColor` del pictograma: el del
 * elemento o el de su familia, igual que en la web. Devuelve 1 si dibujó algo.
 */
int norma_svg_draw(const char *svg, double x, double y, double w, double h,
                   const char *colour, const norma_svg_sink *sink);

/** 1 si el texto parece un SVG que se puede dibujar (etiqueta `svg` primero). */
int norma_svg_drawable(const char *svg);

#ifdef __cplusplus
}
#endif

#endif /* NORMA_SVG_DRAW_H */
