<?php
/** @var array $organization */
/** @var list<array<string,mixed>> $members */
/** @var array $stats */
/** @var list<string> $assignable */
/** @var bool $canManage */
/** @var bool $canOwn */
/** @var int $selfId */
$orgId = (int) $organization['id'];
$labels = $labels ?? \App\Models\Membership::LABELS;
$descriptions = $descriptions ?? \App\Models\Membership::DESCRIPTIONS;
$head = static fn (string $text): string => e($text);
?>
<section class="page-head">
  <div>
    <span class="eyebrow"><a href="<?= e(url('empresas')) ?>">Empresas</a> · <?= e($labels[(string) $organization['role']] ?? 'Sin acceso') ?></span>
    <h1><?= e($organization['name']) ?></h1>
    <p class="page-lead">
      <?php if (($organization['city'] ?? '') !== ''): ?><?= e($organization['city']) ?> · <?php endif; ?>
      <?php if (($organization['tax_id'] ?? '') !== ''): ?><?= e($organization['tax_id']) ?> · <?php endif; ?>
      <?= (int) $stats['projects'] ?> <?= (int) $stats['projects'] === 1 ? 'plano' : 'planos' ?> ·
      <?= (int) $stats['floors'] ?> <?= (int) $stats['floors'] === 1 ? 'piso' : 'pisos' ?> ·
      <?= (int) $stats['members'] ?> <?= (int) $stats['members'] === 1 ? 'persona' : 'personas' ?>
    </p>
  </div>
  <div class="page-head-actions">
    <a class="button button-ghost" href="<?= e(url('')) ?>"><svg class="icon"><use href="#i-grid"></use></svg>Mis planos</a>
    <?php if ($canManage): ?><a class="button button-ghost" href="#datos"><svg class="icon"><use href="#i-settings"></use></svg>Datos de la empresa</a><?php endif; ?>
    <a class="button button-primary" href="<?= e(url('projects/new?organization_id=' . $orgId)) ?>"><svg class="icon"><use href="#i-plus"></use></svg>Nuevo plano</a>
  </div>
</section>

<?php if (!empty($errors)): ?>
  <div class="notice notice-error" role="alert">
    <svg class="icon"><use href="#i-alert"></use></svg>
    <div><strong>Revisa los campos</strong><ul class="notice-list"><?php foreach ($errors as $error): ?><li><?= e($error) ?></li><?php endforeach; ?></ul></div>
  </div>
<?php endif; ?>

<section class="section-block" aria-labelledby="personas" id="personas">
  <div class="section-head">
    <div>
      <span class="eyebrow">Accesos</span>
      <h2 id="personas">Personas</h2>
      <p>Quien tenga acceso ve los planos de esta empresa. El rol decide si solo consulta, si edita o si administra a otras personas.</p>
    </div>
  </div>

  <ul class="member-list">
    <?php foreach ($members as $member): ?>
      <?php $isSelf = (int) $member['user_id'] === $selfId; ?>
      <li class="member-row">
        <div class="member-id">
          <span class="avatar" aria-hidden="true"><?= e(strtoupper(mb_substr((string) $member['name'], 0, 1))) ?></span>
          <span>
            <span class="member-name"><?= e($member['name']) ?><?php if ($isSelf): ?> <span class="member-self">Tú</span><?php endif; ?></span>
            <span class="member-mail"><?= e($member['email']) ?> · <?= e($labels[(string) $member['role']] ?? 'Sin acceso') ?></span>
          </span>
        </div>
        <div class="member-actions">
          <?php if ($canManage && !$isSelf): ?>
            <form method="post" action="<?= e(url('empresas/' . $orgId . '/personas/' . (int) $member['user_id'] . '/rol')) ?>" class="inline-form">
              <?= csrf_field() ?>
              <label class="sr-only" for="rol-<?= (int) $member['user_id'] ?>">Rol de <?= e($member['name']) ?></label>
              <select name="role" id="rol-<?= (int) $member['user_id'] ?>" onchange="this.form.submit()">
                <?php foreach ($assignable as $role): ?>
                  <option value="<?= e($role) ?>" <?= $role === $member['role'] ? 'selected' : '' ?>><?= e($labels[$role] ?? $role) ?></option>
                <?php endforeach; ?>
              </select>
              <noscript><button class="button button-soft" type="submit">Cambiar</button></noscript>
            </form>
            <form method="post" action="<?= e(url('empresas/' . $orgId . '/personas/' . (int) $member['user_id'] . '/quitar')) ?>" class="inline-form" onsubmit="return confirm('¿Quitar el acceso de <?= e(addslashes((string) $member['name'])) ?>? Sus versiones se conservan.');">
              <?= csrf_field() ?>
              <button class="icon-button" type="submit" aria-label="Quitar acceso de <?= e($member['name']) ?>" data-tooltip="Quitar acceso"><svg class="icon"><use href="#i-trash"></use></svg></button>
            </form>
          <?php else: ?>
            <span class="org-role is-<?= e((string) $member['role']) ?>"><?= e($labels[(string) $member['role']] ?? 'Sin acceso') ?></span>
          <?php endif; ?>
        </div>
      </li>
    <?php endforeach; ?>
  </ul>

  <ul class="role-legend">
    <?php foreach ($labels as $role => $label): ?>
      <li><strong><?= e($label) ?></strong><span><?= e($descriptions[$role] ?? '') ?></span></li>
    <?php endforeach; ?>
  </ul>
</section>

<?php if ($canManage): ?>
<section class="section-block" aria-labelledby="invitar">
  <div class="section-head">
    <div>
      <span class="eyebrow">Dar acceso</span>
      <h2 id="invitar">Añadir una persona</h2>
      <p>Si la cuenta ya existe, se le concede acceso a esta empresa. Si no existe, se crea con la contraseña temporal que escribas aquí: entrégala en mano y pídele que la cambie al entrar. La aplicación no envía correos.</p>
    </div>
  </div>
  <form method="post" action="<?= e(url('empresas/' . $orgId . '/personas')) ?>" class="panel-card form-stack" autocomplete="off">
    <?= csrf_field() ?>
    <div class="form-grid">
      <label class="field">
        <span>Correo de la persona <em>Obligatorio</em></span>
        <input type="email" name="email" required maxlength="160" placeholder="nombre@empresa.com">
      </label>
      <label class="field">
        <span>Nombre</span>
        <input type="text" name="name" maxlength="80" placeholder="Solo si la cuenta es nueva">
      </label>
      <label class="field">
        <span>Contraseña temporal</span>
        <input type="password" name="password" minlength="10" autocomplete="new-password" placeholder="Solo si la cuenta es nueva">
        <small>Mínimo 10 caracteres, con letras y números.</small>
      </label>
      <label class="field">
        <span>Rol</span>
        <select name="role">
          <?php foreach ($assignable as $role): ?>
            <option value="<?= e($role) ?>" <?= $role === 'editor' ? 'selected' : '' ?>><?= e($labels[$role] ?? $role) ?></option>
          <?php endforeach; ?>
        </select>
      </label>
    </div>
    <div class="form-actions">
      <button class="button button-primary" type="submit">Añadir a la empresa</button>
    </div>
  </form>
</section>
<?php endif; ?>

<?php if ($canManage): ?>
<section class="section-block" aria-labelledby="datos">
  <div class="section-head">
    <div>
      <span class="eyebrow">Datos</span>
      <h2 id="datos">Datos de la empresa</h2>
    </div>
  </div>
  <form method="post" action="<?= e(url('empresas/' . $orgId)) ?>" class="panel-card form-stack">
    <?= csrf_field() ?>
    <div class="form-grid">
      <label class="field field-wide">
        <span>Nombre de la empresa <em>Obligatorio</em></span>
        <input type="text" name="name" value="<?= e($organization['name']) ?>" required maxlength="120">
      </label>
      <label class="field">
        <span>Identificador tributario</span>
        <input type="text" name="tax_id" value="<?= e($organization['tax_id'] ?? '') ?>" maxlength="40">
      </label>
      <label class="field">
        <span>Ciudad</span>
        <input type="text" name="city" value="<?= e($organization['city'] ?? '') ?>" maxlength="80">
      </label>
    </div>
    <div class="form-actions"><button class="button button-primary" type="submit">Guardar datos</button></div>
  </form>
</section>
<?php endif; ?>

<?php if ($canOwn): ?>
<section class="section-block" aria-labelledby="eliminar" id="eliminar">
  <div class="danger-zone">
    <h2 id="eliminar">Eliminar la empresa</h2>
    <p>Se eliminan sus <?= (int) $stats['projects'] ?> <?= (int) $stats['projects'] === 1 ? 'plano' : 'planos' ?>, sus pisos, las versiones guardadas y las fotografías de verificación. Las cuentas de las personas no se borran: solo pierden el acceso. Esta acción no se puede deshacer.</p>
    <form method="post" action="<?= e(url('empresas/' . $orgId . '/eliminar')) ?>" class="form-stack" onsubmit="return confirm('¿Eliminar «<?= e(addslashes((string) $organization['name'])) ?>» con todos sus planos?');">
      <?= csrf_field() ?>
      <label class="field">
        <span>Escribe <strong><?= e($organization['name']) ?></strong> para confirmar</span>
        <input type="text" name="confirm" required autocomplete="off">
      </label>
      <div class="form-actions"><button class="button button-danger" type="submit">Eliminar empresa</button></div>
    </form>
  </div>
</section>
<?php endif; ?>
