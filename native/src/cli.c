/*
 * Normia nativo · programa de línea de órdenes del núcleo.
 *
 * No dibuja nada: sirve para comprobar que el núcleo compila, arranca y da las
 * mismas cifras que el motor PHP. La ventana nativa llega en la etapa siguiente.
 *
 *   norma-core --check              comprueba el núcleo y termina.
 *   norma-core --version            versión del núcleo.
 *   norma-core --stats plano.json   cifras del plano, en JSON.
 *   norma-core --help               esta ayuda.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "normia/plan.h"
#include <math.h>

#include "normia/audit.h"
#include "normia/grid.h"
#include "normia/svg.h"
#include "normia/units.h"

#define NORMA_CORE_VERSION "0.1.0"

static void usage(FILE *out, const char *program)
{
    fprintf(out,
            "Normia · núcleo nativo %s\n\n"
            "Uso:\n"
            "  %s --check              comprueba el núcleo y termina\n"
            "  %s --version            muestra la versión\n"
            "  %s --stats plano.json   cifras del plano, en JSON\n"
            "  %s --svg plano.json     SVG del plano, por la salida estándar\n"
            "  %s --audit plano.json   superficie libre y aforo, en JSON\n"
            "  %s --help               esta ayuda\n",
            NORMA_CORE_VERSION, program, program, program, program, program, program);
}

/** Lee un archivo completo. Devuelve NULL y explica el motivo si falla. */
static char *read_file(const char *path, size_t *length)
{
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        fprintf(stderr, "No se pudo abrir «%s».\n", path);
        return NULL;
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return NULL;
    }
    const long size = ftell(file);
    if (size < 0) {
        fclose(file);
        return NULL;
    }
    rewind(file);
    char *text = (char *) malloc((size_t) size + 1);
    if (text == NULL) {
        fclose(file);
        return NULL;
    }
    const size_t read = fread(text, 1, (size_t) size, file);
    fclose(file);
    text[read] = '\0';
    *length = read;
    return text;
}

static int command_check(void)
{
    /* Una comprobación mínima de que las conversiones siguen siendo las del
       proyecto: 1 m son 100 cm y un plano en metros declara la misma
       geometría. Si esto falla, el núcleo no sirve para nada más. */
    const int ok = norma_from_meters(1.0, NORMA_UNIT_CM) == 100.0
                   && norma_to_meters(100.0, NORMA_UNIT_CM) == 1.0
                   && norma_cm_per_unit(NORMA_UNIT_M) == 100.0
                   && norma_scale_denominator("1:100") == 100.0
                   && norma_scale_denominator("2:100") == 0.0;
    if (!ok) {
        fprintf(stderr, "El núcleo no arranca: las conversiones no coinciden con las del proyecto.\n");
        return 1;
    }
    printf("Normia · núcleo nativo %s · ok\n", NORMA_CORE_VERSION);
    return 0;
}

static int command_stats(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_plan_stats stats;
    char error[256];
    const int ok = norma_plan_analyze_text(text, length, &stats, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    /* %.17g imprime el número tal como está en memoria: la prueba de paridad
       comparó antes este texto con el del motor PHP y no puede redondear. */
    printf("{\"core\":\"%s\",\"canvas\":{\"width\":%.17g,\"height\":%.17g,\"unit\":\"%s\",\"scale\":\"%s\"},"
           "\"elements\":%lu,\"walls\":%lu,\"curved_walls\":%lu,"
           "\"wall_length_cm\":%.17g,\"wall_length_m\":%.17g,\"canvas_area_m2\":%.17g}\n",
           NORMA_CORE_VERSION,
           stats.width, stats.height, norma_unit_name(stats.unit), stats.scale,
           (unsigned long) stats.elements, (unsigned long) stats.walls, (unsigned long) stats.curved_walls,
           stats.wall_length_cm, stats.wall_length_m, stats.canvas_area_m2);
    return 0;
}

static int command_audit(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    char error[256];
    const int ok = norma_document_from_json(&document, text, length, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    norma_grid grid;
    norma_aforo aforo;
    norma_egress egress;
    if (!norma_audit_aforo(&document, 0, NULL, NULL, &aforo, &grid, error, sizeof(error))) {
        norma_document_free(&document);
        fprintf(stderr, "%s\n", error);
        return 3;
    }
    norma_audit_egress(&document, aforo.used, -1.0, NULL, &egress);
    /* Un tiempo que no se puede calcular sale como null, no como un cero falso. */
    char queue[64];
    if (egress.queue_time_s >= 0.0) {
        snprintf(queue, sizeof(queue), "%.17g", egress.queue_time_s);
    } else {
        snprintf(queue, sizeof(queue), "null");
    }
    /* Las superficies salen redondeadas a dos decimales, como en el informe. */
    printf("{\"core\":\"%s\",\"canvas\":{\"width\":%.17g,\"height\":%.17g,\"unit\":\"%s\",\"scale\":\"%s\"},"
           "\"grid\":{\"cell\":%.17g,\"cellM\":%.17g,\"nx\":%lu,\"ny\":%lu,\"clearance\":%.17g},"
           "\"freeAreaM2\":%.17g,\"exteriorAreaM2\":%.17g,"
           "\"aforo\":{\"maxPersons\":%ld,\"declared\":%ld,\"permitted\":%ld,\"used\":%ld,"
           "\"excess\":%ld,\"source\":\"%s\",\"freeAreaM2\":%.17g,\"density\":%.17g,\"cap\":%ld},"
           "\"egress\":{\"exitCount\":%ld,\"doorCount\":%ld,\"exitWidthM\":%.17g,\"availableWidthM\":%.17g,"
           "\"requiredWidthM\":%.17g,\"queueTimeS\":%s,\"speedMps\":%.17g}}\n",
           NORMA_CORE_VERSION, document.width, document.height, norma_unit_name(document.unit), document.scale,
           grid.cell, grid.cell_m, (unsigned long) grid.nx, (unsigned long) grid.ny, grid.clearance,
           aforo.free_area_m2, round(grid.exterior_area_m2 * 100.0) / 100.0,
           aforo.max_persons, aforo.declared, aforo.permitted, aforo.used,
           aforo.excess, aforo.source, aforo.free_area_m2, aforo.density, aforo.cap,
           egress.exit_count, egress.door_count, egress.exit_width_m, egress.available_width_m,
           egress.required_width_m, queue, egress.speed_mps);
    norma_grid_free(&grid);
    norma_document_free(&document);
    return 0;
}

static int command_svg(const char *path)
{
    size_t length = 0;
    char *text = read_file(path, &length);
    if (text == NULL) {
        return 1;
    }
    norma_document document;
    norma_document_init(&document);
    char error[256];
    const int ok = norma_document_from_json(&document, text, length, error, sizeof(error));
    free(text);
    if (!ok) {
        fprintf(stderr, "%s\n", error);
        return 2;
    }
    const char *name = strrchr(path, '/');
    char title[128];
    snprintf(title, sizeof(title), "%s", name != NULL ? name + 1 : path);
    char *dot = strrchr(title, '.');
    if (dot != NULL) {
        *dot = '\0';
    }
    norma_svg_options options = {1, 1, title};
    char *svg = norma_document_to_svg(&document, &options);
    norma_document_free(&document);
    if (svg == NULL) {
        fprintf(stderr, "No se pudo componer el SVG.\n");
        return 3;
    }
    fputs(svg, stdout);
    free(svg);
    return 0;
}

int main(int argc, char **argv)
{
    const char *program = argc > 0 ? argv[0] : "norma-core";
    if (argc < 2) {
        usage(stderr, program);
        return 64;
    }
    const char *command = argv[1];
    if (strcmp(command, "--help") == 0 || strcmp(command, "-h") == 0) {
        usage(stdout, program);
        return 0;
    }
    if (strcmp(command, "--version") == 0) {
        printf("%s\n", NORMA_CORE_VERSION);
        return 0;
    }
    if (strcmp(command, "--check") == 0) {
        return command_check();
    }
    if (strcmp(command, "--audit") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_audit(argv[2]);
    }
    if (strcmp(command, "--svg") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_svg(argv[2]);
    }
    if (strcmp(command, "--stats") == 0) {
        if (argc < 3) {
            fprintf(stderr, "Falta el archivo del plano.\n");
            return 64;
        }
        return command_stats(argv[2]);
    }
    fprintf(stderr, "Orden no reconocida: %s\n\n", command);
    usage(stderr, program);
    return 64;
}
