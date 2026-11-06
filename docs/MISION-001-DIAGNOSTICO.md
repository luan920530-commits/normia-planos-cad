# MISIÓN 001 · Diagnóstico integral y mapa de madurez

**Normia Planos CAD** — inspección del repositorio para medir la distancia real entre
lo que la aplicación hace hoy y la visión de plataforma integral de Seguridad y Salud
en el Trabajo.

| | |
| --- | --- |
| Fecha de la inspección | 2026-11-02 |
| Rama | `arena/48ee92e3-normia-planos-cad` |
| Commit inspeccionado | `d44c6f0` («Etapa 0 · corrección de curvas») |
| Base | `main` en `aef3b9b` + PR **#56** abierto |
| Versión de la aplicación | **1.18.0** · `user_version = 7` |
| Suites ejecutadas | `node tests/run-all.mjs` → **24/24 en 130,1 s** |
| Comprobaciones | **1 911** (contadas en la salida de cada suite) |

> **Qué es este documento.** Una fotografía honesta del estado, con evidencia de
> código para cada afirmación. No propone implementar nada todavía: identifica qué
> hay, qué está a medias y qué falta, para que la siguiente misión se apruebe sobre
> datos y no sobre impresiones.

---

## 0. Resumen ejecutivo

**Veredicto en una línea:** el núcleo de la aplicación —editor CAD, bibliotecas,
auditoría de evacuación, extintores, guardado versionado y distribución
multiplataforma— está **terminado y probado**; lo que falta para ser una plataforma
integral de SST no es más CAD, sino la **capa de edificio, área, aforo y documento
firmable**, que hoy está en cero o casi cero.

Cinco conclusiones que cambian decisiones:

1. **El producto actual resuelve bien «dibujar y revisar un plano de un piso».** 24
   pasos de prueba en verde, 1 911 comprobaciones, 395 señales, 420 equipos CAD y un
   auditor que mide recorridos reales sobre la geometría. Eso no es una promesa: se
   ejecuta en esta inspección.
2. **No existe el edificio.** El modelo salta de «proyecto» a «piso». No hay entidad
   `buildings`, no hay relación vertical entre plantas, no hay áreas ni recintos con
   identidad. Es el hueco arquitectónico más grande y bloquea todo lo que viene
   después (aforo, escenarios, simulacros).
3. **El aforo está a medio camino y mal expresado.** Lo único que existe es un entero
   por piso (`canvas.occupancy`) y, si se deja en cero, una estimación con densidad
   **0,2 personas/m²** elegida como referencia. No hay máximo documentado, ni
   ocupación real por área, ni histórico. El auditor ya distingue «declarada» de
   «estimada», pero no puede distinguir «el documento dice 120» de «en el turno
   entraron 180».
4. **Se puede imprimir, pero no se puede firmar.** Hay SVG, PNG, vista de impresión,
   informe de revisión y CSV del pliego. No hay PDF generado por el sistema, ni
   bloque de elaboración/revisión/aprobación, ni congelado del informe con la versión
   del plano auditada. Un entregable de SST sin esas tres cosas no cierra un
   expediente.
5. **La deuda técnica viva es pequeña y concreta.** Destacan dos puntos: cambiar la
   unidad del plano **no reconvierte la geometría** (un plano en `cm` que pasa a `m`
   multiplica por 100 su significado físico en silencio) y el mapeo tipo→código de
   señal está **duplicado** en JS y PHP, exactamente el patrón que costó la etapa 0.

---

## 1. Método y alcance

**Qué hice.** Lectura del código completo por capas (núcleo, controladores, modelos,
servicios, vistas, JavaScript del editor, herramientas de distribución y pruebas),
con consultas directas al repositorio para verificar cada afirmación: recuento de
rutas, tablas, catálogos, herramientas y comprobaciones; lectura de las funciones que
producen números.

**Qué ejecuté.** `npm ci`, la suite completa (`24/24`), y por separado las suites
funcional, estabilidad, interfaz, páginas, complementos y escritorio para capturar
sus recuentos exactos. También `lint` de PHP y de JavaScript.

**Qué no pude verificar** (y por tanto no afirmo):

- La **exactitud normativa** de los cálculos. Leí la lógica y ejecuté las pruebas,
  pero ninguna prueba contrasta contra un caso resuelto por una norma. Los umbrales
  viven en `resources/audit-criteria.json`, que se declara «de referencia».
- El **rendimiento** con el máximo permitido (1 200 elementos, 24 capas) y con la
  rejilla de auditoría al límite (120 000 celdas). No lo medí.
- El comportamiento en **dispositivos reales** (APK en Android, instaladores de
  macOS/Windows). Las suites verifican el contenedor y el empaquetado, no la máquina
  del usuario.
- La **accesibilidad** de las pantallas. No la evalué con lector de pantalla.
- Que iOS pueda ejecutar la aplicación **sin servidor**: hoy no hay ningún artefacto
  para iOS (ver A-16).

---

## 2. Estado del repositorio

**Ramas y PR.** La única rama con PR abierto es la actual (`arena/48ee92e3-…`, PR
#56, etapa 0 de NORMIA-004). En el remoto quedan **34 ramas `arena/*`** heredadas de
entregas ya fusionadas: no estorban, pero conviene podarlas para que el historial se
lea.

**Tamaño del código, medido:**

| Área | Líneas | Archivos |
| --- | --- | --- |
| `app/` (PHP: Core, Controllers, Models, Services, Views) | **17 058** | 92 |
| `assets/js/` (editor y bibliotecas) | **11 922** | 24 |
| `tests/` | **8 019** | 12 |
| `tools/` (Android, escritorio, Electron, empaquetado) | **6 549** | — |

**Rutas HTTP:** 74 declaradas en un único punto (`app/Core/Application.php:134-233`).
No hay un archivo de rutas aparte: se leen de arriba abajo, que es coherente con el
principio «MVC explícito y pequeño».

**Base de datos:** 11 tablas (`resources/schema.sql`), `user_version = 7`
(`app/Core/Migrations.php:26`):

| Tabla | Para qué |
| --- | --- |
| `users` | cuentas |
| `organizations`, `memberships` | empresas y roles |
| `projects` | plano de conjunto (sede, centro, responsable) |
| `floors` | piso: diseño vigente, versión, borrador, días de verificación |
| `floor_versions` | historial inmutable con nota y `pinned` |
| `brigade_links` | enlace público por piso |
| `verification_rounds`, `element_checks` | verificación física y evidencias |
| `plugins` | estado de complementos |
| `schema_migrations` | bitácora de migraciones |

No hay `buildings`, ni `areas`, ni `occupancy`, ni `scenarios`, ni `drills`, ni
`resources`/`maintenance`. Esa ausencia es el diagnóstico.

---

## 3. Qué existe, y comprobado en código

### 3.1 Núcleo y seguridad

- **Sin dependencias de ejecución.** No hay Composer ni CDN; el `package.json` es
  exclusivamente de desarrollo. `node tests/js/offline.mjs` recorre los archivos
  servidos y falla ante cualquier petición externa.
- **Servidor como autoridad.** `DesignValidator` revalida todo lo que llega:
  elementos ≤ 1 200, capas ≤ 24, grupos ≤ 80, puntos ≤ 40, JSON ≤ 2,5 MB
  (`app/Services/DesignValidator.php:11-13,38,43`), lista blanca de colores y de
  claves, tipos de trazo con curvas, etc.
- **CSRF, sesión, cabeceras.** `Csrf` en todas las rutas de escritura; sesión con
  `HttpOnly`, `SameSite=Lax`, `secure` bajo HTTPS; CSP estricta con `script-src
  'self'` (`app/Core/Application.php:securityHeaders`).
- **Autorización por capacidad.** Cuatro roles: `owner`, `admin`, `editor`, `viewer`
  (`app/Models/Membership.php:18`), con capacidades acumulativas `view` → `write` →
  `manage` → `own` (`:42`). El último propietario no se puede quitar.
- **Límite conocido:** el freno de intentos de acceso es **por sesión**, no por cuenta
  ni por IP (`app/Core/Auth.php:37-60`). Un atacante que descarte la cookie reinicia
  el contador. Es aceptable en una instalación local; no lo es en una expuesta.

### 3.2 Editor CAD

19 herramientas activas (`assets/js/editor.js:37-59`): selección, mano, muro, tres
tipos de puerta, ruta, tubería, tubería eléctrica, texto, medida, línea, rectángulo,
elipse, vía, andén, paso cebra, parqueadero y lindero; más colocación desde
biblioteca. Sobre eso:

- **Geometría con curvas reales**: arco de tres puntos, radio y flecha, aplanado con
  tolerancia de 0,5 cm compartida cliente/servidor (`PathGeometry`, `geometry.js`).
- **Vías con sección tipo**: carriles, separador, berma, ciclorruta, andenes, más
  glorietas e intersecciones en T y cruz.
- **Edición completa**: mover, escalar, rotar en pasos, voltear, alinear, agrupar,
  bloquear, capas (visibilidad y bloqueo), deshacer/rehacer con historial de 120.
- **Precisión de dibujo**: rejilla con ajuste, reglas, zoom, paneo, cotas y medición.
- **Guardado**: manual con nota, automático en borrador, descarte de borrador, y
  **bloqueo optimista** por versión con `409` si otra sesión guardó antes.

Esto está cubierto por 383 comprobaciones de interfaz sobre la aplicación real en
JSDOM, en PHP 8.1 y 8.3.

### 3.3 Bibliotecas y complementos

- **332 pictogramas ISO 7010** (`resources/iso7010-catalog.json`) + **63 señales de
  servicios y orientación** (`resources/service-signs.json`) = **395**, más **420
  objetos CAD** en **31 categorías** (`resources/cad-objects.json`). Cifras
  verificadas en los archivos, no en el README.
- Búsqueda por sinónimos y sin tildes («calle» → vía, «parqueo» → parqueadero).
- **Complementos como paquetes de datos**, nunca de código: manifiesto `plugin.json`
  o ZIP con SVG, ≤ 4 MB y ≤ 400 elementos, SVG filtrados sin `script` ni `on*`
  (`app/Services/PluginManager.php:32-39`). Un complemento no puede leer la base ni
  los planos: es la decisión correcta y está documentada.

### 3.4 Cálculos y auditorías

| Módulo | Qué calcula de verdad | Evidencia |
| --- | --- | --- |
| Auditor | salidas, ancho útil, recorrido máximo por rejilla con muros y vanos, zonas inalcanzables, ancho requerido por ocupación, tiempo de marcha + cola, señalización | `app/Services/PlanAudit.php:98` y `:533` |
| Extintores | cobertura por celdas, distancia real, radios por perfil y riesgo, sugerencia cuantificada de equipo nuevo | `app/Services/ExtinguisherCoverage.php:31,681` |
| Normas de extintor | NTC 2885 / NFPA 10 / Resolución 2400, siete agentes, capacidades y alturas | `app/Services/ExtinguisherNorms.php:38,203` |
| Redes hidráulicas | longitud por red y diámetro, materiales, pendiente vs referencia | `app/Services/MepCalculator.php:205` |
| Redes eléctricas | carga VA, corriente, breaker, calibre y caída de tensión | `MepCalculator.php:111,89` |
| Unidades | autoridad única PHP/JS con golden de regresión | `app/Core/Units.php`, `assets/js/lib/units.js` |

Los 13 tramos de red de la demo (8 tuberías y 5 circuitos) no tienen curvas; el
golden de 6 405 valores los fija para que ningún refactor mueva una cifra.

### 3.5 Trabajo de campo

- **Verificación física**: inventario derivado del plano (las capas hacen de
  sectores), tres estados, nota, foto ≤ 512 KB, rondas con apertura/cierre, alerta
  por días sin verificar y cobertura por familia y por sector
  (`app/Services/VerificationInventory.php:25,102`).
- **Modo brigadista**: enlace público con token de 32 hex por piso, servible sin
  sesión, con *service worker* para guardar el último plano y acciones grandes (ruta,
  punto de reunión, extintores, llamar al 123). Sin sesión no expone nada más que el
  plano y los datos del proyecto.
- **Modo presentación**: láser, foco, animación de rutas con velocidad, capas y quiz.

### 3.6 Exportación

| Salida | Estado |
| --- | --- |
| SVG con marco y pie | completo, con leyenda de redes y símbolos incrustados |
| JSON de respaldo | completo, esquema v2 con proyecto y piso |
| PNG | completo, dibujado en el navegador con pie |
| Vista de impresión | completa, con tablas de redes |
| Informe de revisión | completo, imprimible |
| CSV/TSV del pliego | completo, con BOM y `;` |
| **PDF generado** | **no existe**; se obtiene por el diálogo de impresión |
| Excel nativo | no; CSV como máximo |
| DWG/DXF | fuera de alcance declarado |

### 3.7 Plataformas

Navegador (servidor PHP propio), **escritorio** (PHP estático con lanzador y router),
**Electron** (macOS 12 mínimo, tres plataformas) y **APK** de Android que abre directo
en el editor. 37 + 40 + 52 comprobaciones respectivamente. **No hay artefacto para
iOS** y el editor **no es una PWA instalable**: el *service worker* existe solo para
la página pública del brigadista (`assets/js/brigade.js:264-286`). En iPhone la
aplicación solo funciona contra un servidor, propio o de la empresa.

### 3.8 Pruebas

| Suite | Comprobaciones |
| --- | --- |
| Funcional PHP (8.1 y 8.3) | 327 × 2 |
| Estabilidad (respaldo, migraciones, poda) | 45 × 2 |
| Interfaz JSDOM | 383 × 2 |
| Páginas y menús | 50 × 2 |
| Longitud de curvas | 14 × 2 |
| Golden numérico | 7 × 2 |
| Unidades PHP | 22 × 2 |
| Complementos | 20 |
| Unidades JS | 27 |
| Escritorio / Android / Electron / Paquetes | 37 / 52 / 40 / 39 |
| **Total** | **1 911** |

Es una base de pruebas poco común en un proyecto de este tamaño, y es lo que permite
hacer refactorizaciones con red.

---

## 4. Mapa de madurez

Escala aplicada:

- **N0 · Ausente** — no hay código ni datos.
- **N1 · Esbozo** — hay datos o una pantalla, pero no un flujo completo.
- **N2 · Funcional** — opera de verdad, con huecos conocidos y sin verificación
  robusta.
- **N3 · Producto** — interfaz, servidor y pruebas; documentado.
- **N4 · Consolidado** — además, contrato único compartido y regresión numérica.

| # | Capacidad | Nivel | Nota breve |
| --- | --- | --- | --- |
| 1 | Instalación, requisitos y demo | **N4** | instalador, demo de 4 pisos, paquetes verificados |
| 2 | Autenticación y sesión | **N3** | sólido; freno de intentos por sesión |
| 3 | Empresas, personas y roles | **N4** | capacidades, aislamiento y migración probadas |
| 4 | Proyectos y pisos | **N3** | hasta 30 pisos; sin edificio |
| 5 | Editor CAD y precisión | **N4** | 19 herramientas, reglas, ajuste, historial |
| 6 | Curvas, vías y secciones | **N4** | aplanado compartido; corrección de arcos con golden |
| 7 | Bibliotecas (395 + 420) | **N4** | catálogos locales, búsqueda, sin CDN |
| 8 | Complementos de datos | **N3** | contrato claro; sin marketplace ni firma |
| 9 | Guardado, borradores, versiones | **N4** | bloqueo optimista, historial inmutable, poda |
| 10 | Respaldo y migraciones | **N4** | ZIP verificado, restauración, bitácora |
| 11 | Auditor de evacuación | **N3** | mide de verdad; criterios de referencia |
| 12 | Extintores y cobertura | **N3** | perfiles y acciones cuantificadas |
| 13 | Redes MEP | **N2** | esquemático, sin cálculo hidráulico |
| 14 | Pliego de señalización | **N2** | sin desglose por sector; falta orden de compra |
| 15 | Rutas internas y accesibilidad | **N3** | A* real; comparador no persiste |
| 16 | Modo presentación | **N3** | láser, foco, animación, quiz |
| 17 | Modo brigadista | **N3** | enlace por piso, sin sesión, offline |
| 18 | Verificación física | **N3** | rondas, foto, cobertura, antigüedad |
| 19 | Exportación de planos | **N3** | SVG/PNG/impresión; escala no real |
| 20 | Unidades y medidas | **N3** | autoridad única; cambio de unidad sin reconversión |
| 21 | **Edificio** | **N0** | no existe |
| 22 | **Áreas y recintos con identidad** | **N0** | solo zonas inalcanzables detectadas |
| 23 | **Aforo (máximo / estimado / real)** | **N1** | un entero por piso |
| 24 | **Escenarios y eventos** | **N0** | no existe |
| 25 | **Simulacros y tiempos reales** | **N0** | no existe |
| 26 | **Documento firmable** | **N1** | informes imprimibles, sin firma ni PDF |
| 27 | **Recursos y mantenimiento** | **N1** | extintores sin fechas ni responsable |
| 28 | API e integraciones | **N1** | endpoints internos, sin tokens |
| 29 | Multiplataforma | **N4** | navegador, escritorio, Electron, APK |
| 30 | iOS nativo / PWA del editor | **N0** | solo brigadista tiene *service worker* |

**Lectura del mapa:** de las 30 capacidades, **15 están en N3-N4** (el producto que ya
se vende) y **9 en N0-N1** (la plataforma que falta). Lo que viene no es «mejorar el
editor»: es construir la mitad de arriba.

---

## 5. Cobertura del flujo integral de SST

El recorrido que la visión describe, etapa por etapa:

### 5.1 Levantar información de la instalación — **cobertura baja**

Hoy se levanta un **piso** y se dibuja. Hay evidencia fotográfica por elemento
(verificación), pero:

- no existe el **edificio** ni la relación entre plantas;
- no existen **áreas** con nombre, uso y superficie propia;
- no hay captura de **anchos medidos**, alturas, pendientes ni materiales de
  construcción más allá del grosor del trazo;
- no hay campos de **aforo observado** ni conteo por turno;
- el «sector» es, de hecho, el **nombre de una capa** (lo usan la verificación y el
  pliego).

### 5.2 Diseñar planos de emergencia — **cobertura alta**

Es la parte madura: muros, puertas con sentido de apertura, rutas, señalización,
equipos, redes, pie normalizado con cinco celdas de orientación, marca de agua,
exportación y modos de presentación y brigada.

### 5.3 Incorporar recursos — **cobertura media**

Los recursos se **dibujan** (extintores con agente, capacidad, rating, riesgo y
altura de montaje), pero no se **gestionan**: no hay número de serie, fecha de
recarga, prueba hidrostática, responsable ni estado de vencimiento. Un extintor
vencido se ve perfectamente colocado en el plano.

### 5.4 Cálculos técnicos — **cobertura media-alta en evacuación, media en redes**

- Evacuación: recorrido, ancho útil, ancho requerido, tiempo estimado, cobertura de
  extintores. Con criterios de referencia explícitos.
- Redes: longitudes, diámetros, pendientes, breaker, calibre y caída de tensión. Sin
  caudal, presión, simultaneidad ni cálculo hidráulico: es **esquemático y así se
  rotula**.
- **Lo que no se calcula:** carga de ocupación por área, tiempo de evacuación por
  tramo con congestión real, capacidad de escaleras, ni verificación de anchos
  medidos en sitio.

### 5.5 Evaluar condiciones de respuesta — **cobertura media**

Hay un cuadro de mando real por piso (hallazgos por severidad, salidas, recorrido,
ocupación, señalización) y cobertura de verificación en campo. Falta la comparación
entre lo que el plano **promete** y lo que la instalación **hace**: no hay registro de
simulacros, ni tiempos reales, ni diferencias entre aforo documentado y ocupación
observada.

### 5.6 Generar documentación — **cobertura baja-media**

Se generan planos y un informe de revisión imprimible. No se genera:

- un **documento de plan de emergencia** con estructura, anexos y firmas;
- un **PDF** producido por el sistema;
- un **informe congelado** que diga «esta revisión se hizo sobre la versión N y estos
  eran los números», requisito para cualquier expediente;
- un **archivo documental** por versión y por fecha.

---

## 6. Funcionalidades parciales, duplicadas o desconectadas

Cada punto con su efecto práctico.

| ID | Hallazgo | Evidencia | Efecto |
| --- | --- | --- | --- |
| **P-01** | Cambiar la unidad del plano (`cm` → `m`) **no reconvierte la geometría** y no pide confirmación | `assets/js/lib/model.js:2039-2052`; selector en `app/Views/editor/index.php:577` | un plano de 12 m pasa a medir 1 200 m sin avisar; auditor y extintores cambian de resultado en silencio |
| **P-02** | El SVG se exporta en **píxeles**, sin escala gráfica ni norte, y `print.css` lo estira al ancho de la hoja | `app/Services/SvgExporter.php:39`; `assets/css/print.css:31-32` | la «escala 1:100» del pie no describe el papel; no se puede medir con regla sobre la impresión |
| **P-03** | Auditoría y redes se calculan sobre el **diseño guardado**, no sobre el borrador en pantalla | `assets/js/editor/audit.js:89`; `FloorApiController::audit` | si hay cambios sin guardar, el informe no corresponde a lo que se ve; la interfaz lo advierte pero no lo impide |
| **P-04** | El pliego calcula `locations` y **nunca lo llena**; la columna «Ubicación» muestra capas | `assets/js/editor/schedule.js:190,273` | no se puede decir «tres señales en el sector Cocina»; se compra a ciegas por sector |
| **P-05** | El comparador de rutas es **efímero**: se pierde al recargar | `assets/js/editor/measure.js:449-473` | no sirve para decidir entre alternativas en una visita posterior |
| **P-06** | El aforo es **un entero por piso** y la estimación usa densidad 0,2 p/m² | `PlanAudit.php:351-360`; `canvas.occupancy` | no hay máximo documentado ni ocupación real; la estimación puede quedar muy lejos del uso |
| **P-07** | Los «recintos» que calcula el auditor son solo **zonas inalcanzables** | `PlanAudit.php:643-700` | no hay áreas nombradas con superficie reutilizable por otras funciones |
| **P-08** | El mapeo tipo→código de señal está **duplicado** en JS y PHP | `assets/js/lib/model.js:188` vs `app/Services/LibraryRepository.php:180` | mismo patrón que la etapa 0 corrigió para unidades; una divergencia cambia conteos del pliego y del auditor |
| **P-09** | La rejilla del servidor (`PlanGrid`, celda 20 cm) y la del cliente para rutas (celda 10 u) son **distintas implementaciones** | `PlanGrid.php:31`; `assets/js/editor/measure.js:17` | dos recorridos pueden diferir entre «medir ruta» y el auditor |
| **P-10** | Las versiones no se pueden **comparar**; solo listar y restaurar | cajón `versions` en `app/Views/editor/index.php` | no se puede responder «qué cambió entre la v2 y la v5» sin abrir dos ventanas |
| **P-11** | `ExtinguisherCoverage::newUnit()` genera identificadores **no deterministas** | `ExtinguisherCoverage.php:819` | pruebas y exportaciones no reproducibles; el golden tiene que enmascararlos |
| **P-12** | El «sector» es el **nombre de la capa** | `VerificationInventory.php:25-52` | renombrar una capa reescribe el sector en cobertura y en pliego |
| **P-13** | Las fotos de verificación se guardan como **BLOB de 512 KB** en SQLite | `app/Models/Check.php:21` | la base y los respaldos crecen rápido; la descarga del ZIP se vuelve pesada |
| **P-14** | El freno de intentos de acceso es **por sesión** | `app/Core/Auth.php:37-60` | se reinicia descartando la cookie |
| **P-15** | El informe de revisión no tiene **firma** ni datos de elaboración/aprobación | `app/Views/editor/audit-report.php` | no sirve como entregable formal |
| **P-16** | El pliego no genera **orden de compra imprimible** | `schedule.js` (solo CSV/TSV) | el paso «comprar» queda fuera de la aplicación |

---

## 7. Capacidades que no existen y la visión necesita

| ID | Capacidad ausente | Por qué importa | Depende de |
| --- | --- | --- | --- |
| **A-01** | Entidad **edificio** y pisos colgando de ella | sin edificio no hay agregación, ni rutas verticales, ni un «plan de la sede» | — |
| **A-02** | **Áreas** con UUID, superficie y perímetro, uso y ocupación | es la unidad de todo lo demás: aforo, riesgos, señalización por sector | A-01 |
| **A-03** | **Aforo documentado** con fuente, criterio, fecha y responsable, más histórico | distingue «máximo permitido» de «estimado» y de «real» | A-02 |
| **A-04** | **Escenarios** y ocupación temporal por evento | una bodega vacía y un evento con 300 personas no son el mismo plano | A-03 |
| **A-05** | **Simulacros**: objetivo vs. tiempo real, participantes, tramos | convierte el auditor en medición, no en promesa | A-04 |
| **A-06** | **Plan de emergencia** como documento con estructura y firmas | es el entregable que se radica | A-03, P-15 |
| **A-07** | **Inventario de recursos** con vida útil y mantenimiento | un extintor dibujado no es un extintor vigente | — |
| **A-08** | **Amenazas y riesgos** por área (matriz) | la SST no es solo evacuación | A-02 |
| **A-09** | **Brigada nominal**: personas, roles, teléfonos, turnos | el enlace público muestra el plano, no quién responde | — |
| **A-10** | **Puntos de encuentro y conteo** post-evacuación | cierra el ciclo de respuesta | A-05 |
| **A-11** | **Calibración dimensional** (escala real) y cotas asociativas | sin ella, «12 m» es una declaración, no una medida | — |
| **A-12** | **API con tokens** e integraciones | conectar con SGSST, ERP o mantenimiento | A-03 |
| **A-13** | **Accesibilidad auditada** (anchos de paso, rampas, ascensores) | hoy solo cambia la holgura del cálculo de rutas | A-02 |
| **A-14** | **Historial por elemento** y colaboración | el bloqueo optimista evita pérdidas, no coordina | — |
| **A-15** | **Firma electrónica** o sello de tiempo | da valor probatorio al informe | A-06 |
| **A-16** | **iOS**: cliente nativo o PWA real del editor | el usuario objetivo usa macOS/iOS | — |
| **A-17** | **Archivo documental** por versión y fecha | hoy el informe se recalcula; no se conserva | A-06 |

---

## 8. Dependencias entre módulos y oportunidades de integración

### 8.1 Dependencias que ya existen (y son sólidas)

```
Units ─────────────► todo lo que mide
PlanGrid ──────────► auditor · extintores · exportador
PathGeometry ──────► rejilla · exportador · MEP (longitud)
LibraryRepository ─► catálogos · códigos de señal · pliego · inventario · exportador
Membership ────────► todos los controladores
floors.design_json ─► editor · auditoría · redes · exportaciones · brigada · verificación
```

El diseño actual ya evita la dispersión en los puntos críticos. Las dos excepciones
son P-08 (mapeo de códigos) y P-09 (rejilla del cliente).

### 8.2 Integraciones que la visión exige y hoy no están

| Integración | Qué desbloquea | Coste |
| --- | --- | --- |
| **Área ↔ auditoría** | sustituir el entero de ocupación por suma de áreas con aforo | alto (requiere A-02) |
| **Verificación ↔ brigada** | que la página pública muestre «señal con novedad» y no solo el dibujo | bajo, y es seguridad real |
| **Auditoría ↔ pliego** | comprar exactamente las señales que faltan según los hallazgos | bajo |
| **Recursos ↔ verificación** | la ronda de campo actualiza vigencia del extintor, no solo su estado | medio |
| **Versión ↔ informe** | congelar el informe con el hash del diseño auditado | bajo-medio |
| **Escenarios ↔ aforo** | simular un evento sin tocar la geometría | alto (requiere A-03) |

La integración **verificación ↔ brigada** merece atención inmediata: hoy una señal
marcada «con novedad» en campo sigue apareciendo normal en la vista de emergencia del
celular del brigadista. Es barato de arreglar y tiene impacto directo en seguridad.

---

## 9. Información técnica que necesita cada módulo

| Módulo | Entradas mínimas para ser confiable | Qué tiene hoy | Qué falta | Consecuencia de que falte |
| --- | --- | --- | --- | --- |
| **Auditor de evacuación** | unidad y escala; muros cerrados; vanos con ancho; `isExit`; ocupación; criterios aplicables | todo lo anterior salvo la escala real; ocupación declarada o estimada | ancho **medido** en sitio; criterios **normativos** elegidos por el usuario; uso del recinto | el resultado es una revisión de referencia, no un dictamen |
| **Extintores** | agente, capacidad, rating, clase de riesgo, perfil | sí, por elemento; riesgo por piso | fechas de recarga y prueba hidrostática; obstrucción/visibilidad; ubicación por área | cobertura **de ubicación**, no de vigencia |
| **Redes hidráulicas** | diámetro, material, pendiente, longitud, caudal | diámetro, material, pendiente, longitud | caudal, presión, unidades de descarga | no hay cálculo hidráulico; solo esquema |
| **Redes eléctricas** | carga VA, tensión, fases, calibre, longitud por circuito | todo, con longitud sumada por circuito | factor de demanda; longitud real por topología | caída de tensión sobrestima o subestima |
| **Rutas y accesibilidad** | ancho de paso, obstáculos, velocidad, pendiente | ancho de puertas, obstáculos grandes, velocidad fija | ancho útil real; rampas; ascensores | el modo silla de ruedas es aproximado |
| **Pliego** | código, cantidad, tamaño, sector, precio | código, cantidad, tamaño por área, precio en `localStorage` | sector real; altura de montaje; stock | la compra no se puede distribuir por zonas |
| **Verificación** | inventario, estado, evidencia, periodicidad | inventario, estados, foto, días globales | periodicidad por tipo; responsable asignado | no se puede programar la ronda |
| **Brigada** | plano, acciones, contactos, nómina | plano y acciones | personas, roles y teléfonos | el enlace no dice quién responde |
| **Aforo (futuro)** | área, uso, densidad o puesto, fuente, fecha | nada | todo | — |
| **Documento (futuro)** | proyecto, responsable, versión, hallazgos, firmas | fragmentos | estructura y firma | — |

Regla que se desprende de la tabla: **todo módulo que produce un número necesita
declarar de dónde sale**. Hoy la aplicación lo hace con los criterios
(`audit-criteria.json`, `extinguisher-criteria.json`) y con el nombre de la unidad;
debería hacerlo igual con la escala, el aforo y los anchos.

---

## 10. Riesgos y límites de lo que se puede afirmar

1. **No hay certificación.** Nada en el sistema certifica cumplimiento normativo, y
   el código lo dice en el pie, en el informe y en cada panel. Eso es correcto y debe
   mantenerse.
2. **Los umbrales son de referencia.** 30 m de recorrido, 5 mm por persona, 1,3
   personas/s/m y 0,2 personas/m² son valores configurables, no la norma colombiana.
   Un usuario podría creer que son límites legales si no lee la nota.
3. **La escala no es una medida.** Mientras no exista calibración (A-11), cualquier
   afirmación de distancia depende de que el dibujo se haya hecho con la unidad
   correcta. Con P-01 abierto, ese supuesto es frágil.
4. **La exactitud numérica no está contrastada.** Las pruebas demuestran
   *consistencia* (que dos caminos coincidan y que nada se mueva), no *corrección*
   contra un caso resuelto por norma.
5. **La distribución no está firmada.** Los instaladores no llevan certificado
   comercial; el usuario debe pasar por Gatekeeper/SmartScreen. Está documentado y no
   se promete lo contrario.

---

## 11. Prioridades recomendadas

Coherentes con el roadmap aprobado en NORMIA-004, y ordenadas por lo que desbloquean:

| Prioridad | Trabajo | Por qué ahora |
| --- | --- | --- |
| **P0** | **Reconversión al cambiar unidad** (cierra P-01) y **escala real** (A-11, P-02) | sin esto, todo número del sistema descansa en un supuesto no verificado; es el criterio de aceptación que la etapa 0 dejó pendiente |
| **P0** | **Edificio y áreas** (A-01, A-02) | es la pieza que convierte «planos sueltos» en «instalación» |
| **P1** | **Aforo documentado** (A-03) con histórico | habilita escenarios, simulacros y documento |
| **P1** | **Documento firmable y PDF** (A-06, A-15, A-17) | es el entregable real del profesional de SST |
| **P1** | **Pliego por sector y orden de compra** (P-04, P-16) | cierra el bloque 6 de la issue #6, que sigue pendiente |
| **P2** | **Recursos y mantenimiento** (A-07) e integración con verificación | convierte el inventario dibujado en inventario vigente |
| **P2** | **Integración verificación ↔ brigada** (barata, alto impacto) | evita mostrar como normal una señal con novedad |
| **P2** | **Comparación de rutas persistente** (P-05) y **diff de versiones** (P-10) | dos huecos de uso diario con coste bajo |
| **P3** | Escenarios (A-04), simulacros (A-05), riesgos (A-08), API (A-12), iOS (A-16) | valor alto, dependencia alta |

**Unificación pendiente de deuda:** P-08 (mapeo de códigos) y P-09 (rejilla del
cliente) deberían resolverse con el mismo patrón que funcionó en la etapa 0: una
autoridad, una tabla de casos compartida y una prueba que falle si divergen.

---

## 12. Anexo · Cifras verificadas en esta inspección

| Dato | Valor | Cómo se comprobó |
| --- | --- | --- |
| Rutas HTTP | 74 | `grep -c "router->" app/Core/Application.php` |
| Archivos PHP | 97 = 92 de `app/` + 5 fuera (arranque, configuración de ejemplo, lanzador y enrutador de escritorio) | `find` + `tests/php/lint.mjs` |
| Archivos JS revisados | 67 | `tests/js/lint.mjs` |
| Tablas | 11 | `resources/schema.sql` |
| Señales | 395 (332 ISO + 63 servicios) | recuento en los dos catálogos |
| Objetos CAD | 420 en 31 categorías | `resources/cad-objects.json` |
| Herramientas del editor | 19 + colocación | `TOOL_META` |
| Pisos por proyecto | 30 | `app/Models/Project.php:189` |
| Elementos por plano | 1 200 | `DesignValidator.php:11` |
| Demo | 4 pisos, 221 elementos, 13 tramos de red | `resources/demo/demo-project.json` |
| Comprobaciones | 1 911 | suma de las 24 suites |
| Suite completa | 24/24 en 130,1 s | `node tests/run-all.mjs` |

---

## 13. Lo que necesito de ti para la MISIÓN 002

1. **Confirmar el orden.** ¿P0 es reconversión de unidad + escala real, o prefieres
   empezar por edificio y áreas aunque los números sigan sin calibrar?
2. **Decidir el entregable documental.** ¿PDF generado en el servidor, o seguir con
   «imprimir → guardar PDF» del navegador y añadir firmas en la vista de impresión?
3. **Decidir el alcance de «recurso».** ¿Basta con extintores, o el inventario debe
   cubrir botiquines, camillas, alarmas, hidrantes y luces de emergencia?
4. **Decidir iOS.** ¿Se acepta «servidor propio + Safari» como respuesta para iPhone,
   o hace falta un artefacto instalable?

Con esas cuatro respuestas se puede escribir la MISIÓN 002 como especificación
cerrada, con criterios de aceptación verificables como los de la etapa 0.
