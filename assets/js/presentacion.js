/*
 * Presentación: navegación de la galería de capturas.
 *
 * Sin JavaScript la galería se recorre con el dedo o la barra de desplazamiento
 * del contenedor (desplazamiento con ajuste), y las flechas no se muestran: no
 * hay botones que no hagan nada. Con JavaScript aparecen y avanzan una captura,
 * respetando «reducir movimiento» del sistema.
 */
(function () {
  'use strict';

  const galeria = document.querySelector('[data-galeria]');
  const anterior = document.querySelector('[data-galeria-prev]');
  const siguiente = document.querySelector('[data-galeria-next]');
  if (!galeria || !anterior || !siguiente) return;

  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const suave = () => ({ behavior: reduce && reduce.matches ? 'auto' : 'smooth', left: 0 });

  const paso = () => {
    const item = galeria.querySelector('.pres-galeria-item');
    const ancho = item ? item.getBoundingClientRect().width : galeria.clientWidth * 0.86;
    return ancho + 16;
  };

  const desplazar = (sentido) => {
    const opciones = suave();
    opciones.left = sentido * paso();
    if (typeof galeria.scrollBy === 'function') {
      galeria.scrollBy(opciones);
    } else {
      galeria.scrollLeft += opciones.left;
    }
  };

  /** Las flechas se apagan en los extremos para no prometer lo que no hay. */
  const actualizar = () => {
    const maximo = Math.max(0, galeria.scrollWidth - galeria.clientWidth);
    const posicion = Math.round(galeria.scrollLeft);
    anterior.disabled = posicion <= 2;
    siguiente.disabled = posicion >= maximo - 2;
    anterior.setAttribute('aria-disabled', String(anterior.disabled));
    siguiente.setAttribute('aria-disabled', String(siguiente.disabled));
  };

  anterior.hidden = false;
  siguiente.hidden = false;
  actualizar();

  anterior.addEventListener('click', () => desplazar(-1));
  siguiente.addEventListener('click', () => desplazar(1));
  galeria.addEventListener('scroll', () => window.requestAnimationFrame(actualizar), { passive: true });

  galeria.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      desplazar(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      desplazar(-1);
    }
  });
})();
