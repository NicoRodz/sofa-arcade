# Diagnóstico: por qué costó acertar a las mesas

Medido, no a ojo. `shared/feel/human-bot.ts` (bot de entrada humana imperfecta) + `tools/feel-measure.ts <checkout>` corren sobre cualquier commit del sim.

## Método

- 15 mapas fijos, 7 acciones (tomar de caja, picar, meter al horno, sacar pizza, entregar, dejar y recoger en mesón), hasta 4 estaciones por acción y mapa, 8 repeticiones con arranque aleatorio: n = 2.392 intentos por fila (error estándar ~1 pp).
- El bot camina por BFS con joystick ruidoso (ruido angular de 14° correlacionado, magnitud 0,7-1), cada salida llega al sim con 60-150 ms de retraso, suelta el palo antes o después del punto (radio de parada 0,05-0,5 tile, compensa la mitad de la deriva), mira a la estación con error uniforme de ±40°, mantiene o suelta el palo y pulsa A (B sostenido en Picar). Reintenta tras 350 ms, máximo 3 pulsaciones.
- **1ª pulsación** = la acción ocurre por la primera pulsación (la métrica estricta). **Acierto** = ocurre en alguna de las 3. **Equivocada** = sin acierto y las manos cambiaron (actuó sobre otra estación). Tiempo total desde que arranca hasta que acierta.
- 1 chef y 4 chefs (los otros 3 hacen otras tareas a la vez: colisión blanda real).

## Por commit (Normal, solo)

| commit | 1ª puls. % | acierto % | equivocada % | t med ms | t p90 ms | 4 chefs 1ª % | 4 chefs acierto % |
|---|---|---|---|---|---|---|---|
| e419490 antes de la fase 1 (palo instantáneo) | 66,5 | 84,4 | 12,5 | 2333 | 4167 | 66,4 | 85,0 |
| 8e3fe08 + R1 inercia (τ 60/50 ms en Normal) | **61,4** | **79,1** | 10,5 | 2417 | 4233 | 63,1 | 79,3 |
| 30a6ca8 + R2 dash, R5 empujón, R6 buffer | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,1 | 79,3 |
| fb81620 + R4 colisión blanda (fin fase 1) | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| f647fa1 + equipos / dueño de estación | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| 0a3fc6b + Ayudante y botones contextuales (nadie en Ayudante) | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| 0bed08c + horno que quema / fuego (flags apagados) | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| 71bc78b master (eventos, rata, campaña) | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| 71bc78b con quema+fuego+eventos encendidos | 61,4 | 78,8 | 10,9 | 2417 | 4250 | 63,0 | 79,1 |
| 71bc78b en Fácil (palo instantáneo) | 66,5 | 84,1 | 12,8 | 2333 | 4167 | 67,4 | 85,6 |
| 71bc78b chef en Ayudante | 84,6 | 92,3 | 6,2 | 2217 | 4000 | 83,7 | 92,0 |

## Ablaciones sobre master (Normal, solo)

| cambio | 1ª puls. % | acierto % | equivocada % | t med ms |
|---|---|---|---|---|
| referencia | 61,4 | 78,8 | 10,9 | 2417 |
| τ = 0 (sin inercia) | 66,5 | 84,1 | 12,8 | 2333 |
| sonda 1,0 + holgura 0,5 (alcance ×1,4 con la regla actual) | 58,4 | 75,4 | 13,3 | 2417 |
| error de orientación 0° | 76,6 | 83,8 | 7,4 | 2283 |
| error de orientación 20° | 74,2 | 83,3 | 7,9 | 2283 |
| latencia 0 ms | 70,1 | 80,1 | 9,0 | 2033 |
| ruido de palo 0 | 62,4 | 77,9 | 10,7 | 2300 |

## Lectura

1. **Lo que degradó el control fue R1, la inercia (commit 8e3fe08), solo en Normal, que es el modo por defecto**: -5,1 pp en 1ª pulsación, -5,3 pp en acierto, +84 ms en la mediana. Fácil y Difícil conservan el palo instantáneo (66,5 / 84,1). Nada posterior lo movió más de 0,3 pp: dash/empujón/buffer (R2/R5/R6), colisión blanda (R4), equipos, Ayudante, quema, eventos y campaña son neutros para acertar a una mesa (el buffer de 150 ms no ayuda porque el humano ya apuntó cuando pulsa).
2. **El problema de fondo no es nuevo.** El radio de alcance y la selección de estación son los de F2 (5338fb2: sonda a 0,8 tile en la dirección de mirada, holgura 0,3, gana la más cercana a la sonda). Aun antes de la fase 1 solo 2 de cada 3 primeras pulsaciones acertaban. Con orientación perfecta sube a 76,6 % y se queda ahí: el resto son estaciones vecinas (en `Hornear` y `Meter al horno` ~22 % acierta en otra estación).
3. **Subir el alcance con la regla actual empeora** (58,4 %): la sonda cae sobre la mesa de al lado. Hace falta puntuar candidatas, no agrandar el círculo.
4. La latencia pesa más que la inercia en 1ª pulsación (+8,7 pp sin ella) pero no se puede quitar: el magnetismo debe absorber el retraso (orientar solo y perdonar la parada).
5. El Ayudante (alcance ×1,5, auto-orientación) llega a 84,6 / 92,3: es la referencia de lo que el magnetismo debe dar a todos.

No medido aquí: jitter real de la red y del celular, la rata (se mide en el bloque 3) y fps de la pantalla.
