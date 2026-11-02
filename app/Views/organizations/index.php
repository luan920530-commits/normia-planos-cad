<section class="page-head">
  <div>
    <span class="eyebrow">Espacio de trabajo</span>
    <h1>Empresas</h1>
    <p class="page-lead">Cada empresa agrupa sus planos y las personas que los consultan o editan. Puedes pertenecer a varias: verás los planos de todas, cada uno identificado con su empresa.</p>
  </div>
  <div class="page-head-actions">
    <a class="button button-primary" href="<?= e(url('empresas/nueva')) ?>"><svg class="icon"><use href="#i-plus"></use></svg>Nueva empresa</a>
  </div>
</section>

<?php if (empty($organizations)): ?>
  <div class="empty-state">
    <span class="empty-icon"><svg class="icon"><use href="#i-property"></use></svg></span>
    <h2>Aún no perteneces a ninguna empresa</h2>
    <p>Crea una empresa para agrupar tus planos y, después, invita a las personas que trabajarán contigo.</p>
    <a class="button button-primary" href="<?= e(url('empresas/nueva')) ?>">Crear empresa</a>
  </div>
<?php else: ?>
  <div class="org-grid">
    <?php foreach ($organizations as $organization): ?>
      <?php $role = (string) ($organization['role'] ?? 'viewer'); ?>
      <article class="org-card">
        <h3><a href="<?= e(url('empresas/' . (int) $organization['id'])) ?>"><?= e($organization['name']) ?></a></h3>
        <div class="org-card-meta">
          <span class="org-role is-<?= e($role) ?>"><?= e($labels ?? \App\Models\Membership::LABELS[$role] ?? 'Sin acceso') ?></span>
          <?php if (($organization['city'] ?? '') !== ''): ?><span><?= e($organization['city']) ?></span><?php endif; ?>
          <?php if (($organization['tax_id'] ?? '') !== ''): ?><span>· <?= e($organization['tax_id']) ?></span><?php endif; ?>
        </div>
        <ul class="org-counts">
          <li><strong><?= (int) $organization['project_count'] ?></strong>planos</li>
          <li><strong><?= (int) $organization['member_count'] ?></strong>personas</li>
        </ul>
        <a class="button button-ghost" href="<?= e(url('empresas/' . (int) $organization['id'])) ?>">Ver empresa y personas</a>
      </article>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
