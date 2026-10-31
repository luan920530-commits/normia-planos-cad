<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#0b1220">
  <title><?= e($title) ?> · Normia Planos CAD</title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/editor.css')) ?>">
</head>
<body class="editor-body">
<?php \App\Core\View::partial('partials/icons'); ?>
<div class="editor-app" id="editor-app">
  <header class="editor-topbar">
    <div class="editor-topbar-left">
      <a class="rail-back" href="<?= e(url('projects/' . (int) $project['id'])) ?>" data-tooltip="Volver al proyecto" aria-label="Volver al proyecto">
        <svg class="icon"><use href="#i-chevron-left"></use></svg>
      </a>
      <a class="editor-brand" href="<?= e(url('')) ?>" data-tooltip="Ir a mis planos" aria-label="Normia Planos CAD">
        <span class="brand-mark small"><svg class="icon"><use href="#i-logo"></use></svg></span>
      </a>
      <div class="editor-doc-title">
        <strong><?= e($project['name']) ?></strong>
        <span><span data-floor-label><?= e($floor['name']) ?></span> · <span data-version-label>v<?= e($floor['version']) ?></span> · <?= e($floor['level'] !== '' ? 'Nivel ' . $floor['level'] : 'Sin nivel') ?></span>
      </div>
      <div class="floor-switcher menu-wrap">
        <button class="floor-switch-button" type="button" data-menu-toggle aria-expanded="false" aria-label="Cambiar de piso">
          <svg class="icon"><use href="#i-layers"></use></svg>
          <span class="floor-switch-label">Cambiar piso</span>
          <svg class="icon chevron"><use href="#i-chevron-down"></use></svg>
        </button>
        <div class="menu floor-menu" hidden>
          <span class="menu-label">Pisos del proyecto</span>
          <?php foreach ($siblings as $sibling): ?>
            <a class="menu-item <?= (int) $sibling['id'] === (int) $floor['id'] ? 'is-current' : '' ?>" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $sibling['id'] . '/editor')) ?>">
              <svg class="icon"><use href="#i-layers"></use></svg>
              <span><?= e($sibling['name']) ?> <small>v<?= e($sibling['version']) ?></small></span>
              <?php if ((int) $sibling['id'] === (int) $floor['id']): ?><svg class="icon check"><use href="#i-check"></use></svg><?php endif; ?>
            </a>
          <?php endforeach; ?>
          <a class="menu-item menu-item-muted" href="<?= e(url('projects/' . (int) $project['id'] . '#pisos')) ?>"><svg class="icon"><use href="#i-plus"></use></svg>Añadir o gestionar pisos</a>
        </div>
      </div>
    </div>
    <div class="editor-topbar-right">
      <div class="save-status" data-save-status data-state="saved" role="status" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <span data-save-label>Guardado</span>
      </div>
      <div class="history-controls">
        <button class="icon-button dark" type="button" data-undo disabled data-tooltip="Deshacer · Ctrl+Z" aria-label="Deshacer">
          <svg class="icon"><use href="#i-undo"></use></svg>
        </button>
        <button class="icon-button dark" type="button" data-redo disabled data-tooltip="Rehacer · Ctrl+Shift+Z" aria-label="Rehacer">
          <svg class="icon"><use href="#i-redo"></use></svg>
        </button>
      </div>
      <button class="button button-primary editor-save" type="button" data-save>
        <svg class="icon"><use href="#i-save"></use></svg><span>Guardar</span>
      </button>
      <button class="button button-soft editor-export" type="button" data-open-drawer="export">
        <svg class="icon"><use href="#i-export"></use></svg><span>Exportar</span>
      </button>
    </div>
  </header>

  <div class="editor-banners" data-banners aria-live="polite"></div>

  <div class="editor-workbench">
    <nav class="rail" aria-label="Herramientas del editor">
      <div class="rail-main">
        <button class="rail-button is-active" type="button" data-tool="select" aria-pressed="true" data-tooltip="Seleccionar · V" aria-label="Seleccionar y mover">
          <svg class="icon"><use href="#i-select"></use></svg><span>Seleccionar</span>
        </button>
        <button class="rail-button" type="button" data-tool="hand" aria-pressed="false" data-tooltip="Mano: desplazar el lienzo · H" aria-label="Desplazar el lienzo">
          <svg class="icon"><use href="#i-hand"></use></svg><span>Mano</span>
        </button>
        <button class="rail-button" type="button" data-tool="wall" aria-pressed="false" data-tooltip="Muro · M" aria-label="Dibujar muro">
          <svg class="icon"><use href="#i-wall"></use></svg><span>Muro</span>
        </button>
        <div class="rail-flyout-wrap">
          <button class="rail-button" type="button" data-tool="door" aria-pressed="false" data-tooltip="Puerta sencilla · U" aria-label="Insertar puerta sencilla">
            <svg class="icon"><use href="#i-door"></use></svg><span>Puertas</span>
          </button>
          <button class="rail-caret" type="button" data-door-menu aria-expanded="false" aria-label="Más tipos de puerta" data-tooltip="Puertas dobles y portones">
            <svg class="icon"><use href="#i-chevron-down"></use></svg>
          </button>
          <div class="rail-flyout" data-door-flyout hidden>
            <button type="button" data-tool="door"><svg class="icon"><use href="#i-door"></use></svg>Puerta sencilla · U</button>
            <button type="button" data-tool="door_double"><svg class="icon"><use href="#i-door-double"></use></svg>Puerta doble · Shift+U</button>
            <button type="button" data-tool="door_garage"><svg class="icon"><use href="#i-door-garage"></use></svg>Portón o reja · R</button>
          </div>
        </div>
        <button class="rail-button" type="button" data-tool="route" aria-pressed="false" data-tooltip="Ruta de evacuación · E" aria-label="Trazar ruta de evacuación">
          <svg class="icon"><use href="#i-route"></use></svg><span>Ruta</span>
        </button>
        <div class="rail-flyout-wrap">
          <button class="rail-button" type="button" data-tool="pipe" aria-pressed="false" data-tooltip="Tubería · P" aria-label="Trazar tubería">
            <svg class="icon"><use href="#i-pipe"></use></svg><span>Tubería</span>
          </button>
          <button class="rail-caret" type="button" data-pipe-menu aria-expanded="false" aria-label="Elegir red de tubería" data-tooltip="Agua, gas, desagües e incendio">
            <svg class="icon"><use href="#i-chevron-down"></use></svg>
          </button>
          <div class="rail-flyout" data-pipe-flyout hidden>
            <?php foreach ($networks as $key => $network): ?>
              <button type="button" data-tool="pipe" data-network="<?= e($key) ?>"><span class="swatch-dot" style="--swatch:<?= e($network['color']) ?>"></span><?= e($network['label']) ?> · <?= e($network['short']) ?></button>
            <?php endforeach; ?>
          </div>
        </div>
        <button class="rail-button" type="button" data-tool="conduit" aria-pressed="false" data-tooltip="Tubería eléctrica · Shift+P" aria-label="Trazar tubería eléctrica">
          <svg class="icon"><use href="#i-conduit"></use></svg><span>Eléctrico</span>
        </button>
        <button class="rail-button" type="button" data-tool="text" aria-pressed="false" data-tooltip="Texto · T" aria-label="Añadir texto">
          <svg class="icon"><use href="#i-text"></use></svg><span>Texto</span>
        </button>
        <button class="rail-button" type="button" data-tool="dimension" aria-pressed="false" data-tooltip="Medida · D" aria-label="Añadir medida">
          <svg class="icon"><use href="#i-dimension"></use></svg><span>Medida</span>
        </button>
        <div class="rail-flyout-wrap">
          <button class="rail-button" type="button" data-shape-menu aria-expanded="false" data-tooltip="Líneas y formas · L, B, O" aria-label="Líneas y formas">
            <svg class="icon"><use href="#i-shapes"></use></svg><span>Formas</span>
          </button>
          <div class="rail-flyout" data-shape-flyout hidden>
            <button type="button" data-tool="line"><svg class="icon"><use href="#i-line"></use></svg>Línea</button>
            <button type="button" data-tool="rect"><svg class="icon"><use href="#i-rect"></use></svg>Rectángulo</button>
            <button type="button" data-tool="ellipse"><svg class="icon"><use href="#i-ellipse"></use></svg>Elipse</button>
          </div>
        </div>
        <span class="rail-separator" role="separator"></span>
        <button class="rail-button rail-library" type="button" data-open-library="sign" data-tooltip="Biblioteca de señalización ISO 7010" aria-label="Biblioteca de señalización ISO 7010">
          <svg class="icon"><use href="#i-sign"></use></svg><span>Señales</span>
          <em class="rail-count" data-sign-count><?= e((string) $catalog['signs']) ?></em>
        </button>
        <button class="rail-button rail-library" type="button" data-open-library="cad" data-tooltip="Biblioteca de equipamiento CAD" aria-label="Biblioteca de equipamiento CAD">
          <svg class="icon"><use href="#i-cad"></use></svg><span>Equipos</span>
          <em class="rail-count" data-cad-count><?= e((string) $catalog['cad']) ?></em>
        </button>
      </div>
      <div class="rail-bottom">
        <button class="rail-button" type="button" data-open-drawer="audit" data-tooltip="Revisión del plano · auditor y evacuación" aria-label="Revisión del plano">
          <svg class="icon"><use href="#i-audit"></use></svg><span>Revisión</span>
          <em class="rail-count rail-count-alert" data-audit-count hidden></em>
        </button>
        <button class="rail-button" type="button" data-open-drawer="schedule" data-tooltip="Pliego de señalización · inventario de compra" aria-label="Pliego de señalización">
          <svg class="icon"><use href="#i-bom"></use></svg><span>Pliego</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="measure" data-tooltip="Medir rutas internas · distancias de recorrido" aria-label="Medir rutas internas">
          <svg class="icon"><use href="#i-measure"></use></svg><span>Rutas</span>
        </button>
        <button class="rail-button" type="button" data-present-open data-tooltip="Modo presentación · pantalla limpia, láser y quiz" aria-label="Modo presentación">
          <svg class="icon"><use href="#i-present"></use></svg><span>Presentar</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="networks" data-tooltip="Redes y circuitos" aria-label="Redes y circuitos">
          <svg class="icon"><use href="#i-network"></use></svg><span>Redes</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="layers" data-tooltip="Capas" aria-label="Capas">
          <svg class="icon"><use href="#i-layers"></use></svg><span>Capas</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="versions" data-tooltip="Versiones" aria-label="Versiones">
          <svg class="icon"><use href="#i-history"></use></svg><span>Versiones</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="footer" data-tooltip="Pie de plano" aria-label="Pie de plano">
          <svg class="icon"><use href="#i-layout-footer"></use></svg><span>Pie de plano</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="settings" data-tooltip="Ajustes del piso" aria-label="Ajustes del piso">
          <svg class="icon"><use href="#i-settings"></use></svg><span>Ajustes</span>
        </button>
        <button class="rail-button" type="button" data-open-drawer="shortcuts" data-tooltip="Atajos y ayuda" aria-label="Atajos y ayuda">
          <svg class="icon"><use href="#i-keyboard"></use></svg><span>Atajos</span>
        </button>
      </div>
    </nav>

    <main class="canvas-stage">
      <div class="stage-toolbar">
        <div class="tools-palette" data-tools-palette>
          <button class="tool-palette-button" type="button" data-tools-toggle aria-expanded="false" aria-haspopup="true" data-tooltip="Todas las herramientas" aria-label="Todas las herramientas">
            <span class="tool-palette-icon"><svg class="icon"><use href="#i-select" data-tools-icon></use></svg></span>
            <span class="tool-palette-copy"><small>Herramienta</small><strong data-tools-label>Seleccionar</strong></span>
            <svg class="icon chevron"><use href="#i-chevron-down"></use></svg>
          </button>
          <div class="tools-popover" data-tools-popover hidden role="menu" aria-label="Todas las herramientas">
            <header class="tools-popover-head">
              <div><strong>Todas las herramientas</strong><small>Elige una y sigue dibujando</small></div>
              <kbd>H</kbd>
            </header>
            <div class="tool-group">
              <p class="tool-group-title">Seleccionar</p>
              <div class="tool-group-grid">
                <button class="tool-choice" type="button" role="menuitem" data-tool="select" data-tool-choice="select"><span class="tool-choice-icon"><svg class="icon"><use href="#i-select"></use></svg></span><span class="tool-choice-name">Seleccionar</span><kbd>V</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="hand" data-tool-choice="hand"><span class="tool-choice-icon"><svg class="icon"><use href="#i-hand"></use></svg></span><span class="tool-choice-name">Mano</span><kbd>H</kbd></button>
              </div>
            </div>
            <div class="tool-group">
              <p class="tool-group-title">Dibujar</p>
              <div class="tool-group-grid">
                <button class="tool-choice" type="button" role="menuitem" data-tool="wall" data-tool-choice="wall"><span class="tool-choice-icon"><svg class="icon"><use href="#i-wall"></use></svg></span><span class="tool-choice-name">Muro</span><kbd>M</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="door" data-tool-choice="door"><span class="tool-choice-icon"><svg class="icon"><use href="#i-door"></use></svg></span><span class="tool-choice-name">Puerta</span><kbd>U</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="route" data-tool-choice="route"><span class="tool-choice-icon"><svg class="icon"><use href="#i-route"></use></svg></span><span class="tool-choice-name">Ruta de evacuación</span><kbd>E</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="door_double" data-tool-choice="door_double"><span class="tool-choice-icon"><svg class="icon"><use href="#i-door-double"></use></svg></span><span class="tool-choice-name">Puerta doble</span><kbd>Shift U</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="pipe" data-tool-choice="pipe"><span class="tool-choice-icon"><svg class="icon"><use href="#i-pipe"></use></svg></span><span class="tool-choice-name">Tubería</span><kbd>P</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="door_garage" data-tool-choice="door_garage"><span class="tool-choice-icon"><svg class="icon"><use href="#i-door-garage"></use></svg></span><span class="tool-choice-name">Portón o reja</span><kbd>R</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="conduit" data-tool-choice="conduit"><span class="tool-choice-icon"><svg class="icon"><use href="#i-conduit"></use></svg></span><span class="tool-choice-name">Tubería eléctrica</span><kbd>Shift P</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="text" data-tool-choice="text"><span class="tool-choice-icon"><svg class="icon"><use href="#i-text"></use></svg></span><span class="tool-choice-name">Texto</span><kbd>T</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="dimension" data-tool-choice="dimension"><span class="tool-choice-icon"><svg class="icon"><use href="#i-dimension"></use></svg></span><span class="tool-choice-name">Medida</span><kbd>D</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="line" data-tool-choice="line"><span class="tool-choice-icon"><svg class="icon"><use href="#i-line"></use></svg></span><span class="tool-choice-name">Línea</span><kbd>L</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="rect" data-tool-choice="rect"><span class="tool-choice-icon"><svg class="icon"><use href="#i-rect"></use></svg></span><span class="tool-choice-name">Rectángulo</span><kbd>B</kbd></button>
                <button class="tool-choice" type="button" role="menuitem" data-tool="ellipse" data-tool-choice="ellipse"><span class="tool-choice-icon"><svg class="icon"><use href="#i-ellipse"></use></svg></span><span class="tool-choice-name">Elipse</span><kbd>O</kbd></button>
              </div>
            </div>
            <div class="tool-group">
              <p class="tool-group-title">Insertar</p>
              <div class="tool-group-grid">
                <button class="tool-choice" type="button" role="menuitem" data-open-library="sign"><span class="tool-choice-icon"><svg class="icon"><use href="#i-sign"></use></svg></span><span class="tool-choice-name">Señales</span><span class="tool-choice-badge"><?= e((string) $catalog['signs']) ?></span></button>
                <button class="tool-choice" type="button" role="menuitem" data-open-library="cad"><span class="tool-choice-icon"><svg class="icon"><use href="#i-cad"></use></svg></span><span class="tool-choice-name">Equipos</span><span class="tool-choice-badge"><?= e((string) $catalog['cad']) ?></span></button>
              </div>
            </div>
            <footer class="tools-popover-foot"><span class="tool-tip"><kbd>Ctrl</kbd> + clic sobre un elemento superpuesto baja al de abajo.</span></footer>
          </div>
        </div>
        <span class="toolbar-separator" role="separator"></span>
        <div class="zoom-controls">
          <button class="icon-button" type="button" data-zoom="out" data-tooltip="Alejar" aria-label="Alejar"><svg class="icon"><use href="#i-zoom-out"></use></svg></button>
          <button class="zoom-label" type="button" data-zoom="reset" data-tooltip="Zoom 100%"><span data-zoom-label>100%</span></button>
          <button class="icon-button" type="button" data-zoom="in" data-tooltip="Acercar" aria-label="Acercar"><svg class="icon"><use href="#i-zoom-in"></use></svg></button>
          <button class="icon-button" type="button" data-zoom="fit" data-tooltip="Ajustar a pantalla · 0" aria-label="Ajustar a pantalla"><svg class="icon"><use href="#i-fit"></use></svg></button>
        </div>
        <span class="toolbar-separator" role="separator"></span>
        <button class="toggle-button is-active" type="button" data-toggle="grid" aria-pressed="true" data-tooltip="Mostrar cuadrícula"><svg class="icon"><use href="#i-grid-dots"></use></svg><span>Cuadrícula</span></button>
        <button class="toggle-button is-active" type="button" data-toggle="snap" aria-pressed="true" data-tooltip="Ajustar a cuadrícula"><svg class="icon"><use href="#i-magnet"></use></svg><span>Ajuste</span></button>
        <button class="toggle-button is-active" type="button" data-toggle="rulers" aria-pressed="true" data-tooltip="Mostrar reglas"><svg class="icon"><use href="#i-ruler"></use></svg><span>Reglas</span></button>
        <span class="toolbar-separator" role="separator"></span>
        <span class="stage-hint" data-stage-hint>Selecciona y arrastra para mover. Usa la barra lateral para dibujar.</span>
      </div>
      <div class="canvas-shell" data-canvas-shell>
        <div class="ruler ruler-h" data-ruler-h aria-hidden="true"></div>
        <div class="ruler ruler-v" data-ruler-v aria-hidden="true"></div>
        <svg id="plan-canvas" class="plan-canvas" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="canvas-empty-hint" data-empty-hint hidden>
          <span class="empty-hint-icon"><svg class="icon"><use href="#i-wall"></use></svg></span>
          <strong>Empieza tu plano</strong>
          <p>Dibuja muros, añade puertas y traza rutas. También puedes colocar pictogramas ISO 7010 y equipamiento desde las bibliotecas.</p>
          <div class="empty-hint-actions">
            <button class="button button-small" type="button" data-tool="wall">Dibujar muro</button>
            <button class="button button-small button-ghost" type="button" data-open-library="sign">Abrir señales</button>
          </div>
        </div>
        <div class="selection-marquee" data-marquee hidden></div>
      </div>
      <div class="stage-statusbar">
        <span class="status-item" data-cursor-position>X 0 · Y 0</span>
        <span class="status-item" data-selection-status>Sin selección</span>
        <span class="status-item status-stack" data-stack-status hidden></span>
        <span class="status-spacer"></span>
        <span class="status-item" data-canvas-size><?= e($floor['name']) ?></span>
        <span class="status-item" data-scale-label>Sin escala</span>
        <span class="status-item status-disclaimer">Representación esquemática · verifica en sitio</span>
        <button class="mobile-props-button" type="button" data-toggle-properties>Propiedades</button>
      </div>
    </main>

    <aside class="properties-panel" data-properties-panel aria-label="Propiedades de la selección">
      <header class="properties-head">
        <div class="properties-heading">
          <span class="eyebrow">Inspector</span>
          <h2 data-properties-title>Propiedades</h2>
        </div>
        <div class="properties-head-actions">
          <span class="properties-count" data-selection-count hidden></span>
          <button class="icon-button properties-close" type="button" data-close-properties aria-label="Cerrar propiedades"><svg class="icon"><use href="#i-close"></use></svg></button>
        </div>
      </header>
      <div class="properties-body" data-properties></div>
    </aside>
  </div>
</div>

<div class="drawer-backdrop" data-drawer-backdrop hidden></div>

<section class="drawer" data-drawer="library" hidden aria-labelledby="library-title">
  <header class="drawer-head">
    <div><span class="eyebrow" data-library-eyebrow>Biblioteca visual</span><h2 id="library-title" data-library-title>Señalización ISO 7010</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar biblioteca"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="library-toolbar">
    <label class="search-field">
      <svg class="icon"><use href="#i-search"></use></svg>
      <input type="search" data-library-search placeholder="Buscar por nombre, código o alias" autocomplete="off" aria-label="Buscar en la biblioteca">
    </label>
    <div class="family-chips" data-library-families role="group" aria-label="Familias"></div>
  </div>
  <div class="library-body">
    <div class="library-results">
      <div class="library-count" data-library-count></div>
      <div class="library-grid" data-library-grid></div>
      <button class="button button-ghost library-more" type="button" data-library-more hidden>Mostrar más</button>
    </div>
    <aside class="library-detail" data-library-detail>
      <div class="library-detail-empty">
        <span><svg class="icon"><use href="#i-sign"></use></svg></span>
        <p>Elige un pictograma u objeto para ver su vista previa, familia y descripción.</p>
      </div>
    </aside>
  </div>
  <footer class="drawer-foot">
    <p data-library-attribution>Pictogramas ISO 7010 locales, con licencias y atribuciones incluidas en el paquete.</p>
  </footer>
</section>

<section class="drawer" data-drawer="audit" hidden aria-labelledby="audit-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Revisión del plano</span><h2 id="audit-title">Auditor de emergencias</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar revisión"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body audit-drawer-body">
    <div class="notice notice-warning compact-notice">
      <svg class="icon"><use href="#i-alert"></use></svg>
      <p>Revisión de <strong>referencia</strong> con umbrales configurables. No es un dictamen ni certifica cumplimiento normativo: verifica el plano en sitio y con un profesional competente.</p>
    </div>
    <div class="audit-toolbar">
      <button class="button button-primary button-small" type="button" data-audit-run><svg class="icon"><use href="#i-audit"></use></svg>Revisar el plano guardado</button>
      <a class="button button-ghost button-small" data-audit-report href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/audit')) ?>" target="_blank" rel="noopener"><svg class="icon"><use href="#i-export"></use></svg>Informe</a>
    </div>
    <div class="audit-content" data-audit-content>
      <p class="muted">Pulsa <strong>Revisar</strong> para medir recorridos, comprobar salidas y señalización y listar los hallazgos del plano guardado.</p>
    </div>
  </div>
  <footer class="drawer-foot"><p>Umbrales en <code>resources/audit-criteria.json</code>. El análisis usa el último diseño guardado, no los cambios sin guardar.</p></footer>
</section>

<section class="drawer drawer-wide" data-drawer="schedule" hidden aria-labelledby="schedule-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Compras y montaje</span><h2 id="schedule-title">Pliego de señalización</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar pliego"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body schedule-body">
    <div class="notice notice-info compact-notice">
      <svg class="icon"><use href="#i-info"></use></svg>
      <p>Inventario de <strong>referencia</strong> calculado con las señales y equipos que hay en el plano. Los tamaños y las cantidades son una guía de compra: ajústalos a la norma aplicable y verifica en sitio.</p>
    </div>
    <div class="schedule-toolbar">
      <button class="button button-primary button-small" type="button" data-schedule-run><svg class="icon"><use href="#i-bom"></use></svg>Recalcular</button>
      <button class="button button-ghost button-small" type="button" data-schedule-csv><svg class="icon"><use href="#i-download"></use></svg>Descargar CSV</button>
      <button class="button button-ghost button-small" type="button" data-schedule-copy><svg class="icon"><use href="#i-copy"></use></svg>Copiar tabla</button>
    </div>
    <div class="schedule-content" data-schedule-content>
      <p class="muted">Abre el pliego para contar las señales del plano, agruparlas por código y revisar qué equipos quedaron sin su señal.</p>
    </div>
  </div>
  <footer class="drawer-foot"><p>Los precios unitarios se guardan solo en este navegador. Usa el CSV para llevarlo a Excel o a una orden de compra.</p></footer>
</section>

<section class="drawer" data-drawer="measure" hidden aria-labelledby="measure-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Rutas internas</span><h2 id="measure-title">Medir recorridos</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar medición"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body measure-body">
    <div class="notice notice-info compact-notice">
      <svg class="icon"><use href="#i-measure"></use></svg>
      <p>Distancias de <strong>referencia</strong> sobre el recorrido caminable: rodea muros y equipos, y usa los vanos de las puertas. No sustituye una medición en sitio ni un cálculo de evacuación.</p>
    </div>
    <div class="measure-controls">
      <button class="button button-primary button-small" type="button" data-measure-trace><svg class="icon"><use href="#i-measure"></use></svg>Trazar ruta</button>
      <button class="button button-ghost button-small" type="button" data-measure-clear><svg class="icon"><use href="#i-close"></use></svg>Empezar de nuevo</button>
      <button class="button button-ghost button-small" type="button" data-measure-save disabled><svg class="icon"><use href="#i-layers"></use></svg>Guardar en el plano</button>
    </div>
    <div class="measure-modes" role="group" aria-label="Tipo de recorrido">
      <button class="measure-mode is-active" type="button" data-measure-mode="walk" aria-pressed="true">A pie · 1,2 m/s</button>
      <button class="measure-mode" type="button" data-measure-mode="wheelchair" aria-pressed="false">Silla de ruedas · 0,8 m/s</button>
    </div>
    <div class="measure-content" data-measure-content>
      <p class="muted">Pulsa <strong>Trazar ruta</strong> y haz clic en el origen y en el destino. Puedes añadir paradas intermedias antes de guardar.</p>
    </div>
  </div>
  <footer class="drawer-foot"><p>Leyenda de referencia: 1,2 m/s a pie y 0,8 m/s en silla de ruedas sobre superficie plana. Los anchos libres reales se verifican en sitio.</p></footer>
</section>

<section class="drawer" data-drawer="networks" hidden aria-labelledby="networks-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Instalaciones</span><h2 id="networks-title">Redes y circuitos</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar redes"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body networks-body" data-networks-panel>
    <div class="notice notice-info compact-notice">
      <svg class="icon"><use href="#i-info"></use></svg>
      <p>Resumen de referencia calculado sobre el <strong>último diseño guardado</strong>. No sustituye memoria de cálculo ni revisión de un profesional competente.</p>
    </div>
    <div class="networks-grid" data-networks-content>
      <p class="muted">Cargando resumen de redes…</p>
    </div>
  </div>
  <footer class="drawer-foot"><p>Diámetros, pendientes, calibres y caídas de tensión son valores de referencia configurables en <code>resources/mep-networks.json</code>.</p></footer>
</section>

<section class="drawer drawer-narrow" data-drawer="layers" hidden aria-labelledby="layers-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Organización</span><h2 id="layers-title">Capas</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar capas"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body">
    <p class="help-text">La capa activa recibe los nuevos elementos. Oculta o bloquea capas para trabajar con más control.</p>
    <form class="inline-add-form" data-add-layer-form>
      <label class="field compact"><span>Nueva capa</span><input type="text" name="layer_name" maxlength="60" placeholder="Ej. Señalización" required></label>
      <button class="button button-primary button-small" type="submit"><svg class="icon"><use href="#i-plus"></use></svg>Añadir</button>
    </form>
    <ul class="layer-list" data-layer-list></ul>
  </div>
  <footer class="drawer-foot"><p>Una capa bloqueada no permite editar sus elementos. La visibilidad y el bloqueo se conservan en el diseño guardado.</p></footer>
</section>

<section class="drawer drawer-narrow" data-drawer="versions" hidden aria-labelledby="versions-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Historial inmutable</span><h2 id="versions-title">Versiones del piso</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar versiones"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body">
    <div class="notice notice-info compact-notice"><svg class="icon"><use href="#i-info"></use></svg><p>Restaurar una versión crea una nueva versión; las anteriores no se modifican.</p></div>
    <div class="version-list" data-version-list><p class="muted">Cargando versiones…</p></div>
    <div class="draft-tools">
      <h3>Borrador automático</h3>
      <p class="help-text">El guardado automático no reemplaza las versiones explícitas. Puedes descartar el borrador actual.</p>
      <button class="button button-ghost button-small" type="button" data-discard-draft>Descartar borrador</button>
    </div>
  </div>
</section>

<section class="drawer drawer-narrow" data-drawer="export" hidden aria-labelledby="export-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Salidas</span><h2 id="export-title">Exportar e imprimir</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar exportación"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body export-grid">
    <button class="export-card" type="button" data-export="svg"><span class="export-icon"><svg class="icon"><use href="#i-image"></use></svg></span><strong>SVG</strong><small>Vector limpio del diseño guardado, sin controles del editor.</small><span class="export-action">Descargar <svg class="icon"><use href="#i-download"></use></svg></span></button>
    <button class="export-card" type="button" data-export="png"><span class="export-icon"><svg class="icon"><use href="#i-image"></use></svg></span><strong>PNG</strong><small>Imagen rasterizada a partir del SVG guardado. Útil para informes.</small><span class="export-action">Descargar <svg class="icon"><use href="#i-download"></use></svg></span></button>
    <button class="export-card" type="button" data-export="json"><span class="export-icon"><svg class="icon"><use href="#i-file"></use></svg></span><strong>JSON</strong><small>Formato propio validado. Conserva capas, textos, rotaciones y objetos.</small><span class="export-action">Descargar <svg class="icon"><use href="#i-download"></use></svg></span></button>
    <button class="export-card" type="button" data-export="print"><span class="export-icon"><svg class="icon"><use href="#i-print"></use></svg></span><strong>Imprimir / PDF</strong><small>Abre una hoja limpia; usa el diálogo del navegador para guardar PDF.</small><span class="export-action">Abrir <svg class="icon"><use href="#i-chevron-right"></use></svg></span></button>
    <button class="export-card export-footer-card" type="button" data-open-drawer="footer" data-footer-open><span class="export-icon"><svg class="icon"><use href="#i-layout-footer"></use></svg></span><strong>Pie de plano</strong><small>Franja de orientación y datos del piso que acompaña al SVG, al PNG y a la impresión.</small><span class="export-action">Revisar <svg class="icon"><use href="#i-chevron-right"></use></svg></span></button>
    <div class="notice notice-info export-note"><svg class="icon"><use href="#i-info"></use></svg><p>Las exportaciones usan la última versión guardada, no cambios sin guardar. No se ofrece compatibilidad DWG/DXF en esta versión.</p></div>
  </div>
  <footer class="drawer-foot"><p><a class="text-link" href="<?= e(url('projects/' . (int) $project['id'] . '#importar')) ?>">Importar un plano JSON</a> desde el proyecto.</p></footer>
</section>

<section class="drawer drawer-narrow" data-drawer="footer" hidden aria-labelledby="footer-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Salida</span><h2 id="footer-title">Pie de plano</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar el pie de plano"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body footer-body">
    <p class="help-text">Este pie se agrega automáticamente debajo del plano en la exportación SVG, en el PNG y en la impresión. Toma los datos guardados del proyecto y del piso; los cambios sin guardar no aparecen hasta que guardes.</p>
    <div class="footer-preview" data-footer-preview aria-live="polite">
      <p class="muted">Preparando la vista previa…</p>
    </div>
    <div class="footer-cells" data-footer-cells></div>
    <div class="notice notice-info"><svg class="icon"><use href="#i-info"></use></svg><p>Las cinco celdas de orientación son fijas: posición actual, rutas, salidas, equipos contra incendios y punto de reunión. El bloque inferior incluye proyecto, piso, nivel, sitio, área, responsable, escala, unidad, versión, fecha de guardado, número de elementos y la nota de la aplicación que generó el plano.</p></div>
  </div>
  <footer class="drawer-foot footer-actions">
    <button class="button button-primary button-small" type="button" data-export="print"><svg class="icon"><use href="#i-print"></use></svg>Imprimir con el pie</button>
    <button class="button button-ghost button-small" type="button" data-export="svg"><svg class="icon"><use href="#i-download"></use></svg>Descargar SVG</button>
  </footer>
</section>

<section class="drawer drawer-narrow" data-drawer="settings" hidden aria-labelledby="settings-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Configuración</span><h2 id="settings-title">Ajustes del piso</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar ajustes"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body">
    <form class="form-stack" data-floor-settings-form>
      <h3>Identificación</h3>
      <label class="field"><span>Nombre del piso</span><input type="text" name="name" maxlength="80" value="<?= e($floor['name']) ?>" required></label>
      <label class="field"><span>Nivel</span><input type="text" name="level" maxlength="40" value="<?= e($floor['level']) ?>" placeholder="1, Sótano, Mezzanine"></label>
      <button class="button button-primary button-small" type="submit">Guardar datos del piso</button>
    </form>
    <hr class="drawer-divider">
    <form class="form-stack" data-canvas-form>
      <h3>Lienzo y escala</h3>
      <div class="form-row">
        <label class="field"><span>Ancho</span><input type="number" name="width" min="400" max="4000" step="1" value="<?= e($floor['design']['canvas']['width']) ?>" required></label>
        <label class="field"><span>Alto</span><input type="number" name="height" min="300" max="3000" step="1" value="<?= e($floor['design']['canvas']['height']) ?>" required></label>
      </div>
      <div class="form-row">
        <label class="field"><span>Cuadrícula</span><input type="number" name="grid" min="5" max="100" step="1" value="<?= e($floor['design']['canvas']['grid']) ?>" required></label>
        <label class="field"><span>Unidad</span><select name="unit"><?php foreach (['cm', 'm', 'mm'] as $unit): ?><option value="<?= e($unit) ?>" <?= $floor['design']['canvas']['unit'] === $unit ? 'selected' : '' ?>><?= e($unit) ?></option><?php endforeach; ?></select></label>
      </div>
      <label class="field"><span>Escala de referencia</span><input type="text" name="scale" pattern="1:[0-9]{1,5}" value="<?= e($floor['design']['canvas']['scale']) ?>" required><small>Referencia de impresión; verifica en sitio.</small></label>
      <label class="field"><span>Ocupación declarada (personas)</span><input type="number" name="occupancy" min="0" max="10000" step="1" value="<?= e((string) ($floor['design']['canvas']['occupancy'] ?? 0)) ?>"><small>Con 0 el auditor estima la ocupación por superficie libre y lo advierte en el informe.</small></label>
      <button class="button button-primary button-small" type="submit">Aplicar lienzo</button>
      <p class="help-text">Los cambios de lienzo forman parte del diseño y se confirman al guardar el plano.</p>
    </form>
    <hr class="drawer-divider">
    <label class="switch-row"><span><strong>Guardado automático</strong><small>Guarda un borrador recuperable cada pocos segundos.</small></span><input type="checkbox" data-autosave-toggle checked></label>
    <a class="text-link" href="<?= e(url('projects/' . (int) $project['id'] . '/edit')) ?>">Editar datos del proyecto</a>
  </div>
  <footer class="drawer-foot"><p>Las representaciones son esquemáticas y no certifican cumplimiento automático.</p></footer>
</section>

<section class="drawer drawer-narrow" data-drawer="shortcuts" hidden aria-labelledby="shortcuts-title">
  <header class="drawer-head">
    <div><span class="eyebrow">Ayuda</span><h2 id="shortcuts-title">Atajos de teclado</h2></div>
    <button class="icon-button" type="button" data-close-drawer aria-label="Cerrar atajos"><svg class="icon"><use href="#i-close"></use></svg></button>
  </header>
  <div class="drawer-body shortcut-grid">
    <div><kbd>V</kbd><span>Seleccionar</span></div><div><kbd>H</kbd><span>Mano (desplazar)</span></div>
    <div><kbd>M</kbd><span>Muro</span></div><div><kbd>Ctrl + clic</kbd><span>Seleccionar lo que está debajo</span></div>
    <div><kbd>U</kbd><span>Puerta</span></div><div><kbd>E</kbd><span>Ruta de evacuación</span></div>
    <div><kbd>P</kbd><span>Tubería</span></div><div><kbd>Shift + P</kbd><span>Tubería eléctrica</span></div>
    <div><kbd>T</kbd><span>Texto</span></div><div><kbd>D</kbd><span>Medida</span></div>
    <div><kbd>L</kbd><span>Línea</span></div><div><kbd>B</kbd><span>Rectángulo</span></div>
    <div><kbd>O</kbd><span>Elipse</span></div><div><kbd>Ctrl + Z</kbd><span>Deshacer</span></div>
    <div><kbd>Ctrl + Shift + Z</kbd><span>Rehacer</span></div><div><kbd>Ctrl + C / V</kbd><span>Copiar / pegar</span></div>
    <div><kbd>Ctrl + D</kbd><span>Duplicar</span></div><div><kbd>Supr</kbd><span>Eliminar selección</span></div>
    <div><kbd>Ctrl + G</kbd><span>Agrupar</span></div><div><kbd>Ctrl + Shift + G</kbd><span>Desagrupar</span></div>
    <div><kbd>Ctrl + L</kbd><span>Bloquear / desbloquear</span></div><div><kbd>Ctrl + S</kbd><span>Guardar versión</span></div>
    <div><kbd>Ctrl + A</kbd><span>Seleccionar todo</span></div><div><kbd>Flechas</kbd><span>Mover 1 unidad</span></div>
    <div><kbd>Shift + flechas</kbd><span>Mover 10 unidades</span></div><div><kbd>Rueda</kbd><span>Zoom al cursor</span></div>
    <div><kbd>Espacio + arrastrar</kbd><span>Desplazar lienzo</span></div><div><kbd>Botón central</kbd><span>Desplazar lienzo</span></div>
    <div><kbd>+ / −</kbd><span>Acercar / alejar</span></div><div><kbd>0</kbd><span>Ajustar a pantalla</span></div>
    <div><kbd>Esc</kbd><span>Cancelar o cerrar</span></div><div><kbd>Enter</kbd><span>Terminar ruta</span></div><div><kbd>Retroceso</kbd><span>Quitar el último punto de la ruta</span></div><div><kbd>Clic inicial</kbd><span>Cerrar el circuito de la ruta</span></div>
  </div>
  <footer class="drawer-foot"><p>Los atajos se desactivan mientras escribes en un campo de formulario. Los dibujos son esquemáticos.</p></footer>
</section>

<textarea id="editor-design" hidden><?= e($designJson) ?></textarea>
<textarea id="editor-boot" hidden><?= e(json_encode($boot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?></textarea>
<noscript><div class="noscript-warning">El editor necesita JavaScript activado. El servidor valida y guarda el diseño, pero el lienzo interactivo no estará disponible.</div></noscript>
<script src="<?= e(asset('js/ui.js')) ?>" defer></script>
<script src="<?= e(asset('js/lib/geometry.js')) ?>" defer></script>
<script src="<?= e(asset('js/lib/mep.js')) ?>" defer></script>
<script src="<?= e(asset('js/lib/model.js')) ?>" defer></script>
<script src="<?= e(asset('js/lib/renderer.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/store.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/inspector.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/library.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/audit.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/schedule.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/measure.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor/present.js')) ?>" defer></script>
<script src="<?= e(asset('js/editor.js')) ?>" defer></script>
</body>
</html>
