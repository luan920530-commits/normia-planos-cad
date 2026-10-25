<?php if (!empty($flashes)): ?>
  <div class="toast-stack" data-toast-stack>
    <?php foreach ($flashes as $flash): ?>
      <div class="toast toast-<?= e($flash['type'] ?? 'info') ?>" role="status" data-toast>
        <span class="toast-icon" aria-hidden="true">
          <svg class="icon"><use href="#i-<?= ($flash['type'] ?? '') === 'error' ? 'alert' : (($flash['type'] ?? '') === 'success' ? 'check' : 'info') ?>"></use></svg>
        </span>
        <span class="toast-text"><?= e($flash['message'] ?? '') ?></span>
        <button class="toast-close" type="button" data-toast-close aria-label="Cerrar mensaje">
          <svg class="icon"><use href="#i-close"></use></svg>
        </button>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
