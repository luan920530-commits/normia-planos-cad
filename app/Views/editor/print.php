<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title><?= e($title) ?></title>
  <link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
  <link rel="stylesheet" href="<?= e(asset('css/print.css')) ?>">
</head>
<body class="print-body">
<div class="print-toolbar">
  <a class="button button-ghost" href="<?= e($backUrl) ?>"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7"/></svg>Volver al editor</a>
  <div class="print-title"><strong><?= e($floor['name']) ?></strong><span><?= e($floor['project_name']) ?> · v<?= e($version) ?></span></div>
  <button class="button button-primary" type="button" data-print-button><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M7 8V3h10v5M7 17H4V9h16v8h-3"/><rect x="7" y="14" width="10" height="7" rx="1"/></svg>Imprimir / Guardar PDF</button>
</div>
<main class="print-sheet">
  <div class="print-svg"><?= $svg ?></div>
  <footer class="print-footer">
    <p><strong>Verificación en sitio:</strong> este plano es una representación esquemática. Confirma dimensiones, accesos, rutas, señalización y equipos antes de usarlo. No constituye certificación ni aprobación legal automática.</p>
    <p><?= e($meta['site'] !== '' ? $meta['site'] : '') ?><?= $meta['site'] !== '' && $meta['workplace'] !== '' ? ' · ' : '' ?><?= e($meta['workplace'] !== '' ? $meta['workplace'] : '') ?><?= $meta['responsible'] !== '' ? ' · Responsable: ' . e($meta['responsible']) : '' ?></p>
  </footer>
</main>
<script src="<?= e(asset('js/print.js')) ?>" defer></script>
</body>
</html>
