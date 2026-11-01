<?php
/** @var array $project */
/** @var array $floor */
/** @var array|null $link */
/** @var string $publicUrl */
$enabled = $link !== null && (int) $link['enabled'] === 1;
?>
<section class="page-head">
  <div>
    <span class="eyebrow"><a href="<?= e(url('projects/' . (int) $project['id'])) ?>"><?= e($project['name']) ?></a> · <?= e($floor['name']) ?></span>
    <h1>Modo brigadista</h1>
    <p class="page-lead">Un enlace de solo lectura para el celular de la brigada: sin cuenta, sin menús y con el plano guardado en el dispositivo para consultarlo sin conexión.</p>
  </div>
  <a class="button button-ghost" href="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/editor')) ?>">Volver al editor</a>
</section>

<section class="section-block brigade-panel" aria-labelledby="brigade-status">
  <div class="brigade-status <?= $enabled ? 'is-on' : 'is-off' ?>">
    <span class="brigade-dot" aria-hidden="true"></span>
    <div>
      <h2 id="brigade-status"><?= $enabled ? 'Enlace activo' : 'Enlace desactivado' ?></h2>
      <p><?= $enabled
        ? 'Cualquiera con este enlace puede ver el plano de este piso. Compártelo solo con la brigada.'
        : 'El plano no se puede abrir desde el enlace. Actívalo cuando la brigada lo necesite.' ?></p>
    </div>
  </div>

  <?php if ($enabled): ?>
    <label class="field brigade-link-field">
      <span>Enlace público</span>
      <span class="brigade-link-row">
        <input type="text" readonly value="<?= e($publicUrl) ?>" data-brigade-link aria-label="Enlace público del piso">
        <button class="button button-soft" type="button" data-brigade-copy>Copiar</button>
        <a class="button button-primary" href="<?= e($publicUrl) ?>" target="_blank" rel="noopener">Abrir</a>
      </span>
    </label>
    <p class="help-text">Última actualización del plano: <strong><?= e(short_date((string) $link['floor_updated_at'])) ?></strong>. Se muestra en la página pública y en la copia guardada en el celular.</p>
  <?php endif; ?>

  <div class="brigade-actions-row">
    <?php if (!$enabled): ?>
      <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/brigade')) ?>">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="enable">
        <button class="button button-primary" type="submit">Activar enlace</button>
      </form>
    <?php else: ?>
      <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/brigade')) ?>" data-confirm="El enlace actual dejará de funcionar de inmediato y tendrás que compartir el nuevo. ¿Regenerar el enlace?">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="regenerate">
        <button class="button button-soft" type="submit">Regenerar enlace</button>
      </form>
      <form method="post" action="<?= e(url('projects/' . (int) $project['id'] . '/floors/' . (int) $floor['id'] . '/brigade')) ?>" data-confirm="El enlace dejará de abrir el plano hasta que lo actives de nuevo. ¿Desactivar el enlace?">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="disable">
        <button class="button button-ghost" type="submit">Desactivar</button>
      </form>
    <?php endif; ?>
  </div>
</section>

<section class="section-block" aria-labelledby="brigade-what">
  <h2 id="brigade-what">Qué ve la brigada en el celular</h2>
  <ul class="brigade-list">
    <li><strong>El plano del piso</strong> con la capa de evacuación y el estado de actualización.</li>
    <li><strong>Cuatro acciones grandes</strong>: ruta de evacuación, puntos de reunión, extintores y llamar al 123.</li>
    <li><strong>Alto contraste</strong> para lugares con poca luz y <strong>zoom</strong> con botones o pellizco.</li>
    <li><strong>Copia en el dispositivo</strong>: al primer acceso guarda el plano para abrirlo sin conexión.</li>
    <li><strong>Salir y borrar datos</strong>: limpia la copia local si el teléfono es compartido.</li>
  </ul>
  <p class="help-text">El modo brigadista es una ayuda de consulta. No reemplaza la señalización física, los simulacros ni la verificación en sitio; el plano es esquemático y las medidas se confirman en el edificio.</p>
  <p class="help-text">Cada vez que guardas el plano cambia la fecha de actualización del enlace. Regenerar el token no borra el plano ni las versiones.</p>
</section>
