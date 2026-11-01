<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\View;

/**
 * Presentación pública del producto.
 *
 * Es la primera pantalla para quien no ha iniciado sesión: cuenta qué hace la
 * aplicación, muestra capturas del proyecto de ejemplo y ofrece el formulario
 * de acceso. No consulta la base de datos ni enseña planos de nadie: los datos
 * de las capturas son de la demostración.
 */
final class HomeController
{
    public function index(): void
    {
        View::render('home/index', [
            'title' => 'Planos de emergencia y evacuación',
            'description' => 'Editor de planos de emergencia y evacuación: señalización ISO 7010, rutas medidas, extintores con perfiles normativos, auditor y verificación en campo. Sin nube y sin conexión.',
            'funciones' => $this->funciones(),
            'capturas' => $this->capturas(),
            'distribucion' => $this->distribucion(),
        ], 'publico');
    }

    /** @return list<array{icono:string, titulo:string, texto:string}> */
    private function funciones(): array
    {
        return [
            [
                'icono' => 'i-cad',
                'titulo' => 'Editor CAD en el navegador',
                'texto' => 'Muros, puertas, vías, cotas y equipos sobre un lienzo con reglas, cuadrícula y ajuste. No hay que instalar nada aparte.',
            ],
            [
                'icono' => 'i-sign',
                'titulo' => 'Pictogramas ISO 7010 y CAD',
                'texto' => 'Biblioteca por familia y sector con búsqueda por palabra: señalización de evacuación, equipos y medios de protección.',
            ],
            [
                'icono' => 'i-evacuation',
                'titulo' => 'Rutas de evacuación medidas',
                'texto' => 'Metros y tiempo de recorrido, accesibilidad, tramos A → B → C y comparación entre alternativas sobre el mismo plano.',
            ],
            [
                'icono' => 'i-extinguisher',
                'titulo' => 'Extintores y cobertura',
                'texto' => 'Ubicación y cobertura por área con perfiles de referencia (NTC 2885, NFPA 10 y Resolución 2400 de 1979), con el aviso de que es un cálculo de apoyo.',
            ],
            [
                'icono' => 'i-audit',
                'titulo' => 'Auditor de emergencias',
                'texto' => 'Salidas, recorrido máximo, ocupación declarada y consistencia de la señalización, sobre el último diseño guardado.',
            ],
            [
                'icono' => 'i-check',
                'titulo' => 'Brigadista y verificación',
                'texto' => 'Enlace público por piso para el celular, rondas con estado y foto, cobertura por tipo y sector, y consulta sin internet.',
            ],
        ];
    }

    /**
     * Capturas del proyecto de ejemplo, ya optimizadas (WebP, 1280 px de ancho).
     *
     * @return list<array{clave:string, archivo:string, titulo:string, texto:string, alt:string}>
     */
    private function capturas(): array
    {
        return [
            [
                'clave' => 'panel',
                'archivo' => 'panel.webp',
                'titulo' => 'Panel de proyectos',
                'texto' => 'Sedes, pisos, versiones y biblioteca de planos en una sola vista.',
                'alt' => 'Panel de Normia Planos CAD con el proyecto de ejemplo de cuatro pisos y cuatro versiones guardadas',
            ],
            [
                'clave' => 'editor',
                'archivo' => 'editor.webp',
                'titulo' => 'Editor',
                'texto' => 'Rail de herramientas, lienzo con reglas y panel de propiedades.',
                'alt' => 'Editor con la barra de herramientas a la izquierda, el plano de una bodega en el centro y el inspector a la derecha',
            ],
            [
                'clave' => 'auditor',
                'archivo' => 'auditor.webp',
                'titulo' => 'Auditor de emergencias',
                'texto' => 'Recorrido máximo, salidas, ocupación y medición del ancho útil.',
                'alt' => 'Auditor de emergencias con el resumen del plano, la medición de evacuación y las rutas dibujadas',
            ],
            [
                'clave' => 'extintores',
                'archivo' => 'extintores.webp',
                'titulo' => 'Extintores y cobertura',
                'texto' => 'Perfil normativo, superficie cubierta y áreas descubiertas.',
                'alt' => 'Panel de extintores y cobertura con el mapa de áreas cubiertas y el porcentaje por perfil normativo',
            ],
            [
                'clave' => 'presentacion',
                'archivo' => 'presentacion.webp',
                'titulo' => 'Modo presentación',
                'texto' => 'Pantalla limpia con láser, spotlight, rutas animadas y quiz.',
                'alt' => 'Modo presentación con el plano a pantalla completa y la barra de láser, spotlight, rutas y capas',
            ],
        ];
    }

    /** @return list<array{plataforma:string, archivo:string, detalle:string, pasos:string}> */
    private function distribucion(): array
    {
        $version = defined('NORMA_VERSION') ? (string) constant('NORMA_VERSION') : '';
        $nombre = $version !== '' ? $version : 'actual';

        return [
            [
                'plataforma' => 'Web',
                'archivo' => 'normia-planos-cad-' . $nombre . '.zip',
                'detalle' => 'PHP 8.1 o superior con pdo_sqlite. Se descomprime en el servidor y se abre en el navegador.',
                'pasos' => 'Los paquetes web viajan en la carpeta «paquetes» del repositorio, junto con sus sumas SHA-256.',
            ],
            [
                'plataforma' => 'macOS 12 o superior',
                'archivo' => 'normia-planos-cad-' . $nombre . '-macos-x64.dmg',
                'detalle' => 'Edición Electron con PHP 8.3 compilado a WebAssembly: no hace falta instalar PHP. Intel y Apple Silicon.',
                'pasos' => 'El instalador se compila en un Mac con «bash tools/electron/build-mac.sh»; el flujo de escritorio también lo genera.',
            ],
            [
                'plataforma' => 'Android 8 o superior',
                'archivo' => 'normia-planos-cad-' . $nombre . '-android.apk',
                'detalle' => 'El editor completo dentro de la app, firmado con clave propia y sin permiso de red.',
                'pasos' => 'El APK lo produce el flujo «Distribución de Android» del repositorio y se instala desde el teléfono.',
            ],
        ];
    }
}
