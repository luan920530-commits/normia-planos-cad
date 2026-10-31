# Extintores y cobertura

Normia calcula, sobre el plano guardado, qué superficie del piso alcanza cada
extintor y cuánta puede asignársele según su clasificación. El resultado es un
**apoyo de diseño**: no es un dictamen, no certifica cumplimiento normativo y no
sustituye la revisión en sitio ni la placa del equipo.

## Normas de referencia

| Perfil | Referencia | Se usa para |
| --- | --- | --- |
| `colombia` (por defecto) | NTC 2885:2009 (idéntica a NFPA 10:2007) y Resolución 2400 de 1979, arts. 220–224 | Distancias, áreas, alturas y cantidad mínima por superficie |
| `nfpa10` | NFPA 10, capítulos 5 y 6 | Mismas tablas de distancias y áreas, sin la regla colombiana de 200 m² |

Las tablas viven en `resources/extinguisher-criteria.json` y se pueden revisar o
ajustar sin tocar código. Cada perfil guarda su referencia y su nota.

## Lo que miden las tablas

- **Clase A** (sólidos comunes): recorrido máximo 22,9 m (75 ft) en riesgo leve,
  ordinario y extra. El área que admite cada unidad depende del número de A y del
  riesgo: 278,7 m² por unidad de A en leve, 139,4 m² en ordinario y 92,9 m² en
  extra, con un tope de 1 045 m² por extintor. Mínimo 2-A (leve y ordinario) y
  4-A (extra).
- **Clase B** (líquidos inflamables): el recorrido depende del número de B y del
  riesgo. Leve: 5-B → 9,15 m y 10-B → 15,25 m. Ordinario: 10-B → 9,15 m y
  20-B → 15,25 m. Extra: 40-B → 9,15 m y 80-B → 15,25 m.
- **Clase C** (equipos eléctricos): no tiene distancia propia; se dimensiona con
  la Clase A o B según el combustible predominante.
- **Clase D** (metales): 22,9 m. **Clase K** (aceites de cocina): 9,15 m.
- **Altura**: la parte superior no debe pasar de 1,53 m si el peso bruto es de
  hasta 18,14 kg, ni de 1,07 m si es mayor, salvo extintores sobre ruedas. El
  fondo debe quedar al menos 10 cm por encima del piso.
- **Cantidad mínima** (solo perfil Colombia): un extintor por cada 200 m² de
  local o fracción, cerca de los lugares de mayor riesgo y libres de obstáculos
  (Resolución 2400, art. 221).

Las combinaciones capacidad–clasificación de `examples` y `catalogDefaults` son
referencias comerciales frecuentes, **no** valores fijados por la norma. La norma
fija mínimos por riesgo; la clasificación real está en la placa del equipo.

## Cómo se calcula

1. Se construye la misma rejilla del auditor de evacuación (20 cm, muros
   bloqueados, vanos de puertas abiertos) y se descarta el terreno exterior.
2. Desde cada extintor se ejecuta un **Dijkstra multi-fuente** sobre la rejilla
   con ocho vecinos: el recorrido es el camino real por las circulaciones, no la
   línea recta.
3. Cada celda del piso se asigna al extintor más cercano cuyo límite de
   recorrido la cubra.
4. Se aplica el **segundo criterio**: si a un extintor se le asignó más área de
   la que admite su clasificación, se conservan las celdas más cercanas y las
   demás quedan descubiertas.
5. Las celdas descubiertas se agrupan en zonas contiguas con su motivo
   (recorrido, área, sin paso o sin clase), su punto más desfavorable y el equipo
   más próximo.
6. Para cada acción sugerida se simula el cambio sobre la misma rejilla y se
   mide la ganancia real de cobertura: reubicar, subir la clasificación o añadir
   una unidad.

## Veredicto y acciones

- El **cajón Extintores** muestra el porcentaje cubierto, la superficie
  descubierta, el mínimo por área, una tabla por equipo (agente, capacidad,
  clasificación, recorrido máximo, área máxima, superficie cubierta, señal y
  estado), el mapa de zonas descubiertas y las acciones con su ganancia medida.
- El **inspector** añade una sección «Extintor» con agente, capacidad,
  clasificación, riesgo y altura de montaje, más el veredicto del último cálculo
  guardado y las acciones disponibles para ese equipo.
- El botón **Guardar y verificar** guarda el plano y vuelve a calcular. El
  cálculo siempre usa el último diseño guardado, nunca los cambios en pantalla.

## Hallazgos del auditor

| Código | Severidad | Cuándo aparece |
| --- | --- | --- |
| `ext_missing` | Informativo | El plano no tiene extintores |
| `ext_ratio_short` | Importante | Hay menos unidades que las que pide la regla de 200 m² (perfil Colombia) |
| `ext_travel_too_long` | Crítico o importante | Queda superficie fuera del recorrido máximo del extintor más cercano |
| `ext_coverage_gap` | Crítico o importante | El área asignada supera la que admite la clasificación |
| `ext_no_class_a` | Importante | Ningún equipo declara Clase A y el piso supera 20 m² |
| `ext_wrong_class` | Importante | El rótulo declara una clase que el agente no cubre |
| `ext_without_sign` | Menor | No hay señal F001 a 1,5 m o menos |
| `ext_height` | Menor | La parte superior supera la altura máxima según el peso |
| `ext_obsolete_rating` | Informativo | Clasificación B retirada por NFPA 10 (4B, 6B, 8B, 12B, 16B) |

## Exportación

El CSV usa punto y coma como separador y BOM UTF-8 para abrirse directo en Excel
en español. Incluye una fila por extintor, una por zona descubierta y una de
resumen con el perfil y el riesgo.

## Límites conocidos

- La rejilla usa celdas de 20 cm; un muro delgado bloquea al menos una celda para
  no desaparecer entre dos centros.
- La altura del extintor es un dato declarado, no se mide en el plano.
- El cálculo no conoce el uso real de cada recinto: el riesgo se declara por
  piso y se puede ajustar por equipo.
- La cobertura mide superficie de piso; no evalúa obstrucciones, visibilidad,
  gabinetes ni distancias a equipos específicos.
