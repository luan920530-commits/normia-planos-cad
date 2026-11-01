<section class="plugins-page">
  <header class="form-page-head plugins-head">
    <a class="back-link" href="<?= e(url('')) ?>"><svg class="icon"><use href="#i-chevron-left"></use></svg>Volver</a>
    <span class="eyebrow">Complementos</span>
    <h1>Amplía la biblioteca sin tocar el programa</h1>
    <p>Un complemento es un paquete de datos: añade <strong>señales de señalización</strong> y
      <strong>equipos CAD</strong> a la biblioteca del editor. Se activa y se desactiva cuando quieras y
      puedes quitarlo sin afectar los planos ya guardados. Nunca ejecuta código: solo suma dibujos y textos.</p>
    <p class="plugins-links">
      <a class="button button-small button-ghost" href="<?= e(url('plugins/manual')) ?>"><svg class="icon"><use href="#i-help"></use></svg>Cómo crear un complemento</a>
      <a class="button button-small button-ghost" href="<?= e(url('plugins/plantilla/senalizacion')) ?>"><svg class="icon"><use href="#i-download"></use></svg>Plantilla de señalización</a>
      <a class="button button-small button-ghost" href="<?= e(url('plugins/plantilla/cad')) ?>"><svg class="icon"><use href="#i-download"></use></svg>Plantilla de equipos CAD</a>
    </p>
  </header>

  <div class="stats-grid">
    <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-sign"></use></svg></span><div><strong><?= e((string) $baseCounts['signs']) ?></strong><small>Señales base</small></div></article>
    <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-cad"></use></svg></span><div><strong><?= e((string) $baseCounts['cad']) ?></strong><small>Equipos base</small></div></article>
    <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-stack"></use></svg></span><div><strong><?= e((string) count($plugins)) ?></strong><small>Complementos</small></div></article>
    <article class="stat-card"><span class="stat-icon"><svg class="icon"><use href="#i-check"></use></svg></span><div>
      <strong><?= e((string) array_sum(array_map(static fn (array $p): int => $p['enabled'] ? 1 : 0, $plugins))) ?></strong><small>Activos</small></div></article>
  </div>

  <section class="panel-card plugins-install" id="instalar" aria-labelledby="instalar-title">
    <h2 id="instalar-title">Instalar un complemento</h2>
    <p>Sube un <code>plugin.json</code> suelto o un <code>.zip</code> con el <code>plugin.json</code> en la raíz
      (los SVG pueden ir al lado, citados con <code>svg_file</code>). Límite: <?= e(number_format($maxBytes / 1_000_000, 1, ',', '.')) ?> MB.</p>
    <form method="post" action="<?= e(url('plugins')) ?>" enctype="multipart/form-data" class="import-form">
      <?= csrf_field() ?>
      <label class="file-field">
        <input type="file" name="plugin_file" accept="application/json,application/zip,.json,.zip" required>
        <span class="file-button"><svg class="icon"><use href="#i-upload"></use></svg>Seleccionar complemento</span>
        <span class="file-name" data-file-name>Ningún archivo seleccionado</span>
      </label>
      <button class="button button-primary" type="submit"><svg class="icon"><use href="#i-plus"></use></svg>Instalar y activar</button>
    </form>
    <p class="help-text">El archivo se valida antes de guardarse: identificadores, colores, tamaño y que los
      pictogramas sean SVG seguros (sin <code>&lt;script&gt;</code>, sin enlaces externos, sin datos embebidos).
      Si algo no cuadra, no se instala nada y se explica el motivo.</p>
  </section>

  <?php if ($plugins === []): ?>
    <div class="empty-state">
      <span class="empty-icon"><svg class="icon"><use href="#i-stack"></use></svg></span>
      <h3>Todavía no hay complementos</h3>
      <p>Descarga una plantilla, ábrela con un editor de texto y cambia los dibujos y los textos. Cuando esté lista, súbela aquí.</p>
      <a class="button button-primary" href="<?= e(url('plugins/manual')) ?>">Ver el manual</a>
    </div>
  <?php else: ?>
    <h2 class="plugins-list-title">Instalados</h2>
    <div class="plugin-list">
      <?php foreach ($plugins as $plugin): ?>
        <article class="panel-card plugin-card<?= $plugin['enabled'] ? ' is-on' : ' is-off' ?>">
          <div class="plugin-card-head">
            <div>
              <h3><?= e($plugin['name']) ?> <span class="plugin-version">v<?= e($plugin['version']) ?></span></h3>
              <p class="plugin-meta"><?= e($plugin['author']) ?> · <code><?= e($plugin['id']) ?></code><?php if ($plugin['license'] !== ''): ?> · <?= e($plugin['license']) ?><?php endif; ?></p>
            </div>
            <span class="plugin-state"><?= $plugin['enabled'] ? 'Activo' : 'Desactivado' ?></span>
          </div>
          <?php if ($plugin['description'] !== ''): ?>
            <p class="plugin-description"><?= e($plugin['description']) ?></p>
          <?php endif; ?>
          <ul class="plugin-counts">
            <li><strong><?= e((string) count($plugin['signs'])) ?></strong> señales</li>
            <li><strong><?= e((string) count($plugin['cad'])) ?></strong> equipos CAD</li>
            <?php if ($plugin['categories'] !== []): ?>
              <li><strong><?= e((string) count($plugin['categories'])) ?></strong> familias nuevas</li>
            <?php endif; ?>
            <li>Instalado el <?= e($plugin['installed_at']) ?></li>
          </ul>
          <?php if ($plugin['signs'] !== [] || $plugin['cad'] !== []): ?>
            <details class="plugin-detail">
              <summary>Ver lo que añade</summary>
              <ul>
                <?php foreach ($plugin['signs'] as $sign): ?>
                  <li><strong><?= e($sign['name']) ?></strong> · señal · <code><?= e($sign['code']) ?></code> · familia <?= e($sign['category']) ?></li>
                <?php endforeach; ?>
                <?php foreach ($plugin['cad'] as $object): ?>
                  <li><strong><?= e($object['name']) ?></strong> · equipo · <code><?= e($object['code']) ?></code></li>
                <?php endforeach; ?>
              </ul>
            </details>
          <?php endif; ?>
          <div class="plugin-actions">
            <form method="post" action="<?= e(url('plugins/' . $plugin['id'] . '/toggle')) ?>">
              <?= csrf_field() ?>
              <input type="hidden" name="estado" value="<?= $plugin['enabled'] ? 'desactivar' : 'activar' ?>">
              <button class="button button-small <?= $plugin['enabled'] ? 'button-ghost' : 'button-primary' ?>" type="submit">
                <svg class="icon"><use href="#i-<?= $plugin['enabled'] ? 'lock' : 'check' ?>"></use></svg>
                <?= $plugin['enabled'] ? 'Desactivar' : 'Activar' ?>
              </button>
            </form>
            <form method="post" action="<?= e(url('plugins/' . $plugin['id'] . '/delete')) ?>" data-confirm="Se eliminará el complemento «<?= e($plugin['name']) ?>». Los planos que ya usan sus elementos se conservan, pero dejarán de poder cambiarse por otro de la misma familia. ¿Continuar?">
              <?= csrf_field() ?>
              <button class="button button-small button-danger" type="submit"><svg class="icon"><use href="#i-trash"></use></svg>Eliminar</button>
            </form>
          </div>
        </article>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>

  <section class="panel-card plugins-note">
    <h2>Qué no hace un complemento</h2>
    <ul class="plugins-rules">
      <li><strong>No ejecuta código.</strong> No hay PHP, JavaScript ni plantillas: solo datos y dibujos. Un complemento no puede leer tus planos, tu cuenta ni la base de datos.</li>
      <li><strong>No cambia los planos guardados.</strong> Si desactivas o eliminas un complemento, los planos que ya usaban sus señales se abren igual; sus elementos quedan sin dibujo hasta que vuelvas a activarlo.</li>
      <li><strong>No certifica nada.</strong> Las señales y equipos que añadas son referencias gráficas: verifica normas, medidas y ubicación en sitio.</li>
      <li><strong>Se guarda en tus datos.</strong> Vive en <code>storage/plugins/</code>, así que en el APK viaja con tus planos y sobrevive a cerrar la app.</li>
    </ul>
    <p class="help-text">Versión de API de complementos que entiende esta instalación: <strong><?= e((string) $apiVersion) ?></strong>.</p>
  </section>
</section>
