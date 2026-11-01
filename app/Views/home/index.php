<section class="pres-hero" aria-labelledby="hero-title">
  <div class="pres-wrap pres-hero-grid">
    <div class="pres-hero-copy">
      <p class="pres-eyebrow">Emergencias · evacuación · señalización</p>
      <h1 id="hero-title">Planos claros,<br>evacuación precisa.</h1>
      <p class="pres-hero-lead">
        Dibuja el plano de cada piso, coloca la señalización y las rutas, y revisa
        la cobertura de extintores y salidas antes de imprimir. Todo dentro de tu
        equipo: sin nube, sin cuentas externas y sin conexión obligatoria.
      </p>
      <div class="pres-hero-actions">
        <?php if (!empty($user)): ?>
          <a class="pres-button pres-button-primary pres-button-lg" href="<?= e(url('')) ?>">Abrir el panel</a>
        <?php else: ?>
          <a class="pres-button pres-button-primary pres-button-lg" href="#acceso">Entrar a la aplicación</a>
        <?php endif; ?>
        <a class="pres-button pres-button-ghost pres-button-lg" href="#capturas">Ver capturas</a>
      </div>
      <ul class="pres-hero-facts">
        <li><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg> Funciona sin internet</li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-lock"></use></svg> Datos en el equipo</li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-export"></use></svg> SVG, PNG, CSV y JSON</li>
      </ul>
    </div>
    <div class="pres-hero-art">
      <span class="pres-hero-glow" aria-hidden="true"></span>
      <img class="pres-hero-logo" src="<?= e(asset('img/normia-logo.png')) ?>" alt="Emblema de Normia: un tiburón mecánico" width="384" height="384" decoding="async">
      <p class="pres-hero-tag">Editor de planos de emergencia<br><strong>versión <?= e(defined('NORMA_VERSION') ? (string) constant('NORMA_VERSION') : '') ?></strong></p>
    </div>
  </div>
</section>

<section class="pres-section" id="funciones" aria-labelledby="funciones-title">
  <div class="pres-wrap">
    <p class="pres-eyebrow">Qué hace</p>
    <h2 id="funciones-title">Del dibujo a la ronda de campo</h2>
    <p class="pres-lead">
      Seis piezas que comparten el mismo plano: lo que dibujas es lo que se mide,
      se audita, se imprime y se revisa en el celular.
    </p>
    <ul class="pres-grid-funciones">
      <?php foreach ($funciones as $funcion): ?>
        <li class="pres-card">
          <span class="pres-card-icon"><svg class="icon" aria-hidden="true"><use href="#<?= e($funcion['icono']) ?>"></use></svg></span>
          <h3><?= e($funcion['titulo']) ?></h3>
          <p><?= e($funcion['texto']) ?></p>
        </li>
      <?php endforeach; ?>
    </ul>
    <p class="pres-note">
      Las cifras de auditoría, rutas y extintores son <strong>cálculos de apoyo</strong>
      con umbrales configurables. No sustituyen una revisión profesional ni un dictamen.
    </p>
  </div>
</section>

<section class="pres-section pres-section-alt" id="capturas" aria-labelledby="capturas-title">
  <div class="pres-wrap">
    <p class="pres-eyebrow">Capturas</p>
    <h2 id="capturas-title">Así se ve trabajando</h2>
    <p class="pres-lead">
      Pantallas reales de la aplicación con el proyecto de ejemplo
      «Bodega y oficinas»: <?= count($capturas) ?> vistas del mismo flujo.
    </p>
    <div class="pres-galeria" data-galeria tabindex="0" role="group" aria-label="Capturas de la aplicación: usa las flechas para recorrerlas">
      <?php foreach ($capturas as $indice => $captura): ?>
        <figure class="pres-galeria-item" id="captura-<?= e($captura['clave']) ?>">
          <img src="<?= e(asset('img/presentacion/' . $captura['archivo'])) ?>"
               alt="<?= e($captura['alt']) ?>"
               width="1280" height="644"
               loading="<?= $indice === 0 ? 'eager' : 'lazy' ?>"
               decoding="async">
          <figcaption>
            <strong><?= e($captura['titulo']) ?></strong>
            <span><?= e($captura['texto']) ?></span>
          </figcaption>
        </figure>
      <?php endforeach; ?>
    </div>
    <div class="pres-galeria-controles">
      <button class="pres-button pres-button-ghost" type="button" data-galeria-prev hidden>
        <svg class="icon" aria-hidden="true"><use href="#i-chevron-left"></use></svg> Anterior
      </button>
      <button class="pres-button pres-button-ghost" type="button" data-galeria-next hidden>
        Siguiente <svg class="icon" aria-hidden="true"><use href="#i-chevron-right"></use></svg>
      </button>
    </div>
  </div>
</section>

<section class="pres-acceso" id="acceso" aria-labelledby="acceso-title">
  <div class="pres-wrap pres-acceso-grid">
    <div class="pres-acceso-copy">
      <p class="pres-eyebrow">Acceso</p>
      <h2 id="acceso-title">Entra a tus planos</h2>
      <p class="pres-lead">
        La cuenta se crea durante la instalación de la aplicación en el equipo o
        servidor. No hay credenciales predeterminadas ni registro público: si no
        tienes usuario, pídeselo al administrador de tu instalación.
      </p>
      <ul class="pres-acceso-lista">
        <li><svg class="icon" aria-hidden="true"><use href="#i-lock"></use></svg> Sesión local, sin servicios externos.</li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-keyboard"></use></svg> La contraseña se cambia desde «Mi cuenta».</li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-alert"></use></svg> Tras varios intentos fallidos se bloquea un rato.</li>
      </ul>
    </div>
    <div class="pres-acceso-card">
      <?php \App\Core\View::partial('partials/flashes', ['flashes' => $flashes ?? []]); ?>
      <form method="post" action="<?= e(url('login')) ?>" class="form-stack" autocomplete="on">
        <?= csrf_field() ?>
        <input type="hidden" name="desde" value="inicio">
        <label class="field">
          <span>Correo electrónico</span>
          <input type="email" name="email" value="<?= e($old['email'] ?? '') ?>" required autocomplete="username" inputmode="email" placeholder="tu@empresa.com">
        </label>
        <label class="field">
          <span>Contraseña</span>
          <input type="password" name="password" required autocomplete="current-password" minlength="1" placeholder="Tu contraseña">
        </label>
        <button class="pres-button pres-button-primary pres-button-block" type="submit">Entrar</button>
      </form>
      <p class="pres-acceso-nota">
        ¿Olvidaste la contraseña? La restablece el administrador desde la propia
        instalación; no se envía por correo.
      </p>
    </div>
  </div>
</section>

<section class="pres-section" id="distribucion" aria-labelledby="distribucion-title">
  <div class="pres-wrap">
    <p class="pres-eyebrow">Distribución</p>
    <h2 id="distribucion-title">Tres formas de tenerlo</h2>
    <p class="pres-lead">
      Los paquetes se generan en el repositorio del proyecto, no en una tienda de
      aplicaciones. Esta página no descarga binarios: dice cómo se obtiene cada uno
      y qué necesita.
    </p>
    <ul class="pres-grid-distribucion">
      <?php foreach ($distribucion as $paquete): ?>
        <li class="pres-card pres-card-paquete">
          <h3><?= e($paquete['plataforma']) ?></h3>
          <code class="pres-archivo"><?= e($paquete['archivo']) ?></code>
          <p><?= e($paquete['detalle']) ?></p>
          <p class="pres-paquete-paso"><?= e($paquete['pasos']) ?></p>
        </li>
      <?php endforeach; ?>
    </ul>
    <div class="pres-aviso">
      <svg class="icon" aria-hidden="true"><use href="#i-info"></use></svg>
      <p>
        Sin firma comercial: macOS pide confirmar la primera apertura (clic derecho ›
        Abrir) y Android avisa de instalar «de esta fuente». Los instaladores llevan
        su propio intérprete de PHP; solo la edición web necesita PHP 8.1 o superior
        en el servidor.
      </p>
    </div>
  </div>
</section>
