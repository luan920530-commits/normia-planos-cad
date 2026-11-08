**Editor de planos de evacuación, con la app nativa de macOS que dibuja los diseños del catálogo.** Sin WebView, sin Electron y sin PHP: una ventana AppKit que compila con Xcode y habla con el núcleo en C.

## La app nativa de macOS (Monterey 12 o posterior)

| Adjunto | Qué es |
| --- | --- |
| `NormiaEstudio-nativo-macos12-universal-1.31.0.zip` | `NormiaEstudio.app`, **universal** (Intel + Apple Silicon), compilada con `-mmacosx-version-min=12.0` y firmada en modo ad-hoc · 930 KB |
| `…zip.sha256` | Su suma SHA-256 |

**Cómo abrirla.** Viene sin notarizar (no hay certificado de Apple), así que la primera vez Gatekeeper la frena: clic derecho sobre la app › **Abrir**, o *Ajustes del Sistema › Privacidad y seguridad › Abrir igualmente*. Después abre con doble clic. Se descomprime y se arrastra a Aplicaciones.

## Lo nuevo: los diseños se dibujan, no se nombran

Hasta la 1.30.0, un equipo o una señal del catálogo se pintaba en el lienzo como una caja redondeada con su nombre dentro. El nombre era el del catálogo —820 piezas—, pero el diseño no se veía. Ahora se dibuja el `<svg>` real:

- **Intérprete en el núcleo** (`native/src/svgdraw.c`): `path` con curvas y arcos, `rect`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `g` con `transform`, `use`, `clipPath`, `style`, `fill-opacity`, `currentColor`, `stroke-dasharray` y el `<text>` de nueve piezas (P, E, 30, PARE, SALIDA y 50). Traduce a un destino de dibujo abstracto, así que la misma ruta sirve para Core Graphics, para las miniaturas y para las pruebas.
- **La ventana** dibuja el pictograma con el giro, la opacidad y el color del elemento; solo las tres puertas, cuyo dibujo depende de la bisagra y el abatimiento, conservan su trazo propio. El nombre ya no se escribe encima de la pieza: sigue en el globo y en el inspector.
- **Selector e inspector**: cada fila del catálogo lleva su miniatura de 20 × 20 y la ficha del inspector, una de 32 × 32, rasterizadas una sola vez y guardadas en caché.
- **Dos fallos del intérprete, encontrados comparando** los 754 pictogramas contra una referencia: la repetición de un comando de `path` perdía si era relativo (la señal de prohibición salía como un cuadrado rojo) y una figura sin relleno ni trazo se pegaba a la siguiente (la señal de salida salía manchada). Corregidos los dos, los pictogramas con más de un 10 % de píxeles distintos bajan de 420 a 151.

Todo lo de las etapas anteriores sigue ahí: la maqueta de un CAD —paleta de conjuntos de herramientas, tira de iconos, inspector de capas y propiedades, línea de comando, coordenadas y pestañas Modelo/Layout—, las 19 herramientas del editor web, el muro con el pincel multipunto, la maqueta de guía debajo del plano, la ficha MEP de red y de circuito, el auditor y el simulacro, y el catálogo de 820 piezas en 41 familias con buscador.

## Las demás ediciones

| Adjunto | Plataforma |
| --- | --- |
| `normia-planos-cad-1.31.0-macos-{arm64,x64}.dmg` y `.zip` | Edición Electron · macOS (Apple Silicon e Intel) |
| `normia-planos-cad-1.31.0-windows-x64-instalador.exe` y `.zip` | Edición Electron · Windows 10/11 x64 |
| `normia-planos-cad-1.31.0-linux-x86_64.AppImage` | Edición Electron · Linux x64 |
| `normia-planos-cad-1.31.0-android.apk` | Editor completo para Android |
| `normia-electron-*.SHA256SUMS.txt` | Sumas de cada paquete de Electron |

El **editor web** completo sale como `normia-planos-cad-1.31.0.zip` y `normia-planos-cad-demo-1.31.0.zip` en `paquetes/v1.31.0/` del repositorio: PHP 8.1 o posterior con `pdo_sqlite` y `session`, sin Composer, sin CDN y 100 % local.

## Lo que se comprueba y lo que no

En cada empujón: 28 pasos de `npm run test:quick`, el núcleo en C con `-Werror` (**23 · 83 · 31 · 67 · 30 · 32 · 26 · 29** comprobaciones), la paridad C/PHP (**64**), la ventana de macOS (**121**) y el paquete universal, que arranca con `--check` y `--objects` en un runner de macOS y verifica con `otool` que las dos arquitecturas piden macOS 12.

Lo que **no** se puede comprobar desde un servidor sin pantalla es cómo se ve: los pictogramas en el lienzo a cada zoom, el rótulo dentro del aro y las miniaturas a 20 px. Eso lo mira una persona en su Mac; si algo se ve mal, abre una incidencia con la captura.

---

Este texto es el que lleva la release en GitHub. Se escribe a mano una vez con
`gh release edit vX.Y.Z --notes-file docs/NOTAS-vX.Y.Z.md`: los flujos de
distribución solo adjuntan sus archivos y no deben traer `body:` ni
`body_path:`, o el último en terminar reemplaza estas notas.
