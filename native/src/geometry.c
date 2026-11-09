/*
 * Normia nativo · geometría de trazos.
 *
 * Espejo de `App\Services\PathGeometry` (PHP). Las constantes y el orden de las
 * operaciones se conservan a propósito: la prueba de paridad compara los
 * resultados dígito a dígito contra el motor que ya está en producción.
 */
#include "normia/geometry.h"

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define NORMA_TAU (M_PI * 2.0)

double norma_distance(norma_point a, norma_point b)
{
    return hypot(b.x - a.x, b.y - a.y);
}

norma_point norma_midpoint(norma_point a, norma_point b)
{
    norma_point middle = {(a.x + b.x) / 2.0, (a.y + b.y) / 2.0};
    return middle;
}

double norma_point_segment_distance(norma_point p, norma_point a, norma_point b)
{
    const double dx = b.x - a.x;
    const double dy = b.y - a.y;
    const double length2 = dx * dx + dy * dy;
    if (length2 < 1e-12) {
        return norma_distance(p, a);
    }
    double t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2;
    if (t < 0.0) {
        t = 0.0;
    } else if (t > 1.0) {
        t = 1.0;
    }
    const norma_point closest = {a.x + dx * t, a.y + dy * t};
    return norma_distance(p, closest);
}

/** `fmod` positivo, igual que el `$mod` de PHP. */
static double positive_mod(double value)
{
    const double mod = fmod(fmod(value, NORMA_TAU) + NORMA_TAU, NORMA_TAU);
    return mod;
}

norma_arc norma_arc_from_points(norma_point a, norma_point through, norma_point b)
{
    norma_arc arc;
    arc.valid = 0;
    arc.cx = 0.0;
    arc.cy = 0.0;
    arc.r = 0.0;
    arc.start = 0.0;
    arc.sweep = 0.0;
    arc.sagitta = 0.0;
    arc.direction = 0;
    arc.length = 0.0;

    if (norma_distance(a, b) < 1e-6) {
        return arc;
    }
    const double d = 2.0 * (a.x * (through.y - b.y) + through.x * (b.y - a.y) + b.x * (a.y - through.y));
    if (fabs(d) < 1e-7) {
        return arc;
    }
    const double a2 = a.x * a.x + a.y * a.y;
    const double t2 = through.x * through.x + through.y * through.y;
    const double b2 = b.x * b.x + b.y * b.y;
    const double cx = (a2 * (through.y - b.y) + t2 * (b.y - a.y) + b2 * (a.y - through.y)) / d;
    const double cy = (a2 * (b.x - through.x) + t2 * (a.x - b.x) + b2 * (through.x - a.x)) / d;
    const double r = hypot(a.x - cx, a.y - cy);
    if (!isfinite(cx) || !isfinite(cy) || !isfinite(r) || r > 5e6) {
        return arc;
    }
    const double start = atan2(a.y - cy, a.x - cx);
    const double end = atan2(b.y - cy, b.x - cx);
    const double middle = atan2(through.y - cy, through.x - cx);
    const double forward_span = positive_mod(end - start);
    const double to_middle = positive_mod(middle - start);
    if (forward_span < 1e-7) {
        return arc;
    }
    const int forward = to_middle > 1e-7 && to_middle < forward_span - 1e-7;
    const double sweep = forward ? forward_span : NORMA_TAU - forward_span;
    const double sagitta = r * (1.0 - cos(sweep / 2.0));
    if (!isfinite(sagitta) || sagitta < 1e-4) {
        return arc;
    }
    arc.valid = 1;
    arc.cx = cx;
    arc.cy = cy;
    arc.r = r;
    arc.start = start;
    arc.sweep = sweep;
    arc.sagitta = sagitta;
    arc.direction = forward ? 1 : -1;
    arc.length = r * sweep;
    return arc;
}

norma_point norma_arc_point_at(const norma_arc *arc, double t)
{
    norma_point point = {0.0, 0.0};
    if (arc == NULL || !arc->valid) {
        return point;
    }
    double value = t;
    if (value < 0.0) {
        value = 0.0;
    } else if (value > 1.0) {
        value = 1.0;
    }
    const double angle = arc->start + (double) arc->direction * arc->sweep * value;
    point.x = arc->cx + arc->r * cos(angle);
    point.y = arc->cy + arc->r * sin(angle);
    return point;
}

double norma_polyline_length(const norma_point *points, size_t count, const norma_arc *arcs)
{
    if (points == NULL || count < 2) {
        return 0.0;
    }
    double length = 0.0;
    for (size_t index = 0; index + 1 < count; index += 1) {
        const norma_arc *arc = arcs != NULL ? &arcs[index] : NULL;
        if (arc != NULL && arc->valid) {
            length += arc->length;
        } else {
            length += norma_distance(points[index], points[index + 1]);
        }
    }
    return length;
}
