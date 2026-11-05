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
            "  %s --help               esta ayuda\n",
            NORMA_CORE_VERSION, program, program, program, program);
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
