**La señalización se ve como en la web: su pictograma, sin caja y sin código, y la biblioteca se elige mirando.**

## La app nativa de macOS (Monterey 12 o posterior)

| Adjunto | Qué es |
| --- | --- |
| `NormiaEstudio-nativo-macos12-universal-1.31.1.zip` | `NormiaEstudio.app`, **universal** (Intel + Apple Silicon), macOS 12+ |
| `…zip.sha256` | Su suma SHA-256 |

Viene sin notarizar: la primera vez, clic derecho › **Abrir**. Ahora la barra
superior dice **ESTUDIO · 1.31.1** y *Acerca de Normia Estudio* da la
compilación y las piezas que cargó el catálogo, para no confundir una app vieja
con una nueva.

## Qué cambió frente a la 1.31.0

La 1.31.0 ya dibujaba el `<svg>` de cada pieza, pero quedaban dos restos de la
época de las cajas: la caja de reserva con su marco interior y el código de la
señal escrito debajo (`E075`). La web no hace ninguna de las dos cosas, así que
se igualó:

- **El lienzo pinta el pictograma y nada más.** Fuera la caja gris, el marco
  interior y el código. Solo se rotula lo que escribió la persona, centrado y a
  12 px de la pieza, como la web; `SALIDA` sigue apareciendo en las puertas.
- **La biblioteca es visual.** El buscador dejó de ser una lista de nombres:
  ahora son tarjetas de 104 × 112 con el pictograma a 56 px, el nombre y
  «código · familia», las categorías en fichas con su cifra («Todas 395»,
  «Condición segura 73»…), búsqueda sin tildes, flechas para moverse y doble
  clic o Intro para insertar.
- **Un tipo escrito de otra manera ya no pierde el dibujo**: `ISO-E075`,
  `iso_E075` y `E075` llegan a la misma señal, y `SVC_WC_MEN` a su señal de
  servicios, igual que la web normaliza el código antes de buscar el pictograma.
- **El inspector dice qué pieza es** y avisa si su pictograma no está en el
  catálogo, que es la primera pregunta cuando una señal no se dibuja.

## Cómo reconocer una app vieja

Si las señales se ven como un recuadro verde con el código debajo, esa copia es
anterior a la 1.31.0. El dibujo de los pictogramas llegó con la 1.31.0 y esta
1.31.1 le quitó los restos. La versión está en la barra superior y en *Acerca de*.

## Las demás ediciones

| Adjunto | Plataforma |
| --- | --- |
| `normia-planos-cad-1.31.1-macos-{arm64,x64}.dmg`, `.pkg` y `.zip` | Electron · macOS |
| `normia-planos-cad-1.31.1-windows-x64-instalador.exe` y `.zip` | Electron · Windows 10/11 x64 |
| `normia-planos-cad-1.31.1-linux-x86_64.AppImage` | Electron · Linux x64 |
| `normia-planos-cad-1.31.1-android.apk` | Editor completo para Android |

El **editor web** sale como `normia-planos-cad-1.31.1.zip` y
`normia-planos-cad-demo-1.31.1.zip` en `paquetes/v1.31.1/`: PHP 8.1 o posterior
con `pdo_sqlite` y `session`.

## Lo que se comprueba

28 pasos de `npm run test:quick`, el núcleo en C con `-Werror` (**23 · 83 · 31 ·
67 · 30 · 32 · 26 · 29**), la paridad C/PHP (64), la ventana de macOS (**124**),
el paquete web (39) y el `.app` universal, que arranca con `--check` y
`--objects` en un runner de macOS.

Lo que no se puede comprobar desde aquí es cómo se ve en pantalla: eso lo mira
una persona en su Mac. Para eso está ahora la versión a la vista.

---

Este texto es el que lleva la release en GitHub. Se escribe a mano una vez con
`gh release edit vX.Y.Z --notes-file docs/NOTAS-vX.Y.Z.md`: los flujos de
distribución solo adjuntan sus archivos y no deben traer `body:` ni
`body_path:`, o el último en terminar reemplaza estas notas.
