/*
 * Normia nativo · escritor de JSON.
 */
#include "normia/jsonw.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int reserve(norma_buffer *buffer, size_t extra)
{
    if (buffer->failed) {
        return 0;
    }
    const size_t needed = buffer->length + extra + 1;
    if (needed <= buffer->capacity) {
        return 1;
    }
    size_t capacity = buffer->capacity == 0 ? 256 : buffer->capacity;
    while (capacity < needed) {
        capacity *= 2;
    }
    char *text = (char *) realloc(buffer->text, capacity);
    if (text == NULL) {
        buffer->failed = 1;
        return 0;
    }
    buffer->text = text;
    buffer->capacity = capacity;
    return 1;
}

void norma_buffer_init(norma_buffer *buffer)
{
    if (buffer == NULL) {
        return;
    }
    buffer->text = NULL;
    buffer->length = 0;
    buffer->capacity = 0;
    buffer->failed = 0;
    if (reserve(buffer, 1)) {
        buffer->text[0] = '\0';
    }
}

const char *norma_buffer_text(const norma_buffer *buffer)
{
    if (buffer == NULL || buffer->failed || buffer->text == NULL) {
        return "";
    }
    return buffer->text;
}

void norma_buffer_free(norma_buffer *buffer)
{
    if (buffer == NULL) {
        return;
    }
    free(buffer->text);
    buffer->text = NULL;
    buffer->length = 0;
    buffer->capacity = 0;
    buffer->failed = 0;
}

static void append(norma_buffer *buffer, const char *text, size_t size)
{
    if (buffer == NULL || text == NULL) {
        return;
    }
    if (!reserve(buffer, size)) {
        return;
    }
    memcpy(buffer->text + buffer->length, text, size);
    buffer->length += size;
    buffer->text[buffer->length] = '\0';
}

void norma_buffer_raw(norma_buffer *buffer, const char *text)
{
    if (text != NULL) {
        append(buffer, text, strlen(text));
    }
}

void norma_buffer_string(norma_buffer *buffer, const char *text)
{
    if (buffer == NULL) {
        return;
    }
    append(buffer, "\"", 1);
    if (text != NULL) {
        for (const unsigned char *cursor = (const unsigned char *) text; *cursor != '\0'; cursor += 1) {
            const unsigned char c = *cursor;
            switch (c) {
            case '"': append(buffer, "\\\"", 2); break;
            case '\\': append(buffer, "\\\\", 2); break;
            case '\n': append(buffer, "\\n", 2); break;
            case '\r': append(buffer, "\\r", 2); break;
            case '\t': append(buffer, "\\t", 2); break;
            case '\b': append(buffer, "\\b", 2); break;
            case '\f': append(buffer, "\\f", 2); break;
            default:
                if (c < 0x20) {
                    char escape[8];
                    snprintf(escape, sizeof(escape), "\\u%04x", (unsigned int) c);
                    append(buffer, escape, 6);
                } else {
                    /* El texto llega en UTF-8: se copia tal cual, sin tocarlo. */
                    append(buffer, (const char *) cursor, 1);
                }
                break;
            }
        }
    }
    append(buffer, "\"", 1);
}

void norma_buffer_number(norma_buffer *buffer, double value)
{
    if (buffer == NULL) {
        return;
    }
    if (!isfinite(value)) {
        append(buffer, "0", 1);
        return;
    }
    char text[64];
    /* Los enteros se escriben sin «.0»: el formato del plano los guarda así. */
    if (value == floor(value) && fabs(value) < 1e15) {
        snprintf(text, sizeof(text), "%.0f", value);
    } else {
        snprintf(text, sizeof(text), "%.17g", value);
    }
    append(buffer, text, strlen(text));
}

void norma_buffer_bool(norma_buffer *buffer, int value)
{
    append(buffer, value ? "true" : "false", value ? 4 : 5);
}

void norma_buffer_key(norma_buffer *buffer, const char *key)
{
    if (key == NULL) {
        return;
    }
    norma_buffer_string(buffer, key);
    append(buffer, ":", 1);
}
