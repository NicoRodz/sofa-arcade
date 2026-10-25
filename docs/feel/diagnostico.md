# Diagnóstico: por qué costó acertar a las mesas

Medido, no a ojo. `shared/feel/human-bot.ts` (bot de entrada humana imperfecta) + `tools/feel-measure.ts <checkout>` corren sobre cualquier commit del sim.

## Método

- 15 mapas fijos, 7 acciones (tomar de caja, picar, meter al horno, sacar pizza, entregar, dejar y recoger en mesón), hasta 4 estaciones por acción y mapa, 8 repeticiones con arranque aleatorio: n = 2.392 intentos por fila (error estándar ~1 pp).
- El bot camina por BFS con joystick ruidoso (ruido angular de 14° correlacionado, magnitud 0,7-1), cada salida llega al sim con 60-150 ms de retraso, suelta el palo antes o después del punto (radio de parada 0,05-0,5 tile, compensa la mitad de la deriva), mira a la estación con error uniforme de ±40°, mantiene o suelta el palo y pulsa A (B sostenido en Picar). Reintenta tras 350 ms, máximo 3 pulsaciones.
- **1ª pulsación** = la acción ocurre por la primera pulsación (la métrica estricta). **Acierto** = ocurre en alguna de las 3. **Equivocada** = sin acierto y las manos cambiaron (actuó sobre otra estación). Tiempo total desde que arranca hasta que acierta.
- 1 chef y 4 chefs (los otros 3 hacen otras tareas a la vez: colisión blanda real). El arranque queda a ±0,14 tile del centro de la casilla: una primera versión del bot arrancaba pegada a la pared (el sim no desencaja a un chef que nace dentro) y esos intentos atascados parecían una caída de 5 pp en R1; ya no.

## Por commit (Normal, solo; 4 chefs a la derecha)

| commit | 1ª puls. % | acierto % | equivocada % | t med ms | t p90 ms | 4 chefs 1ª % | 4 chefs acierto % |
|---|---|---|---|---|---|---|---|
| e419490 antes de la fase 1 (palo instantáneo) | 66,3 | 85,2 | 12,5 | 2317 | 4033 | 63,8 | 83,5 |
| 8e3fe08 + R1 inercia (τ 60/50 ms en Normal) | 67,7 | 86,7 | 11,3 | 2417 | 4217 | 68,6 | 87,3 |
| 30a6ca8 + R2 dash, R5 empujón, R6 buffer | 67,7 | 86,5 | 11,6 | 2417 | 4217 | 68,4 | 86,9 |
| fb81620 + R4 colisión blanda (fin fase 1) | 67,7 | 86,5 | 11,6 | 2417 | 4217 | 68,9 | 87,2 |
| f647fa1 … 71bc78b (equipos, Ayudante, botones contextuales, quema, eventos, campaña; sin flags) | 67,7 | 86,5 | 11,6 | 2417 | 4217 | 68,9 | 87,2 |
| 71bc78b con quema+fuego+eventos encendidos | 67,7 | 86,5 | 11,6 | 2417 | 4217 | 68,9 | 87,2 |
| 71bc78b en Fácil (palo instantáneo) | 66,3 | 84,7 | 12,8 | 2300 | 4017 | 65,7 | 84,1 |
| 71bc78b chef en Ayudante | 84,7 | 93,4 | 6,1 | 2183 | 3883 | 84,1 | 92,3 |

## Ablaciones sobre master (Normal, solo)

| cambio | 1ª puls. % | acierto % | equivocada % | t med ms |
|---|---|---|---|---|
| referencia | 67,7 | 86,5 | 11,6 | 2417 |
| τ = 0 (sin inercia) | 66,3 | 84,7 | 12,8 | 2300 |
| sonda 1,0 + holgura 0,5 (alcance ×1,4, misma regla) | 63,8 | 82,4 | 14,9 | 2433 |
| error de orientación 0° | 83,1 | 91,3 | 8,7 | 2317 |
| error de orientación 20° | 81,3 | 91,6 | 8,2 | 2317 |
| latencia 0 ms | 77,3 | 88,8 | 9,3 | 2083 |
| ruido de palo 0 | 68,4 | 85,6 | 12,1 | 2333 |

## Lectura (honesta: la caída de acierto no está en el historial)

1. **Ningún cambio de la fase 1 ni posterior bajó el acierto** (todo dentro de ±1,5 pp, error estándar ~1 pp). R1 (inercia, 8e3fe08) cuesta **+100 ms de mediana (+4 %) y +184 ms en p90** por interacción; Fácil/Difícil (palo instantáneo) son ~100 ms más rápidos. R2/R5/R6 (dash, empujón, buffer), R4 (colisión blanda, también con 4 chefs), equipos, Ayudante, botones contextuales, quema, eventos y campaña son neutros para acertar a una mesa (el dash solo estorba en 1 de cada 100 Picar fallidos).
2. **El problema es estructural y viene de F2** (5338fb2): sonda a 0,8 tile en la dirección de mirada, holgura 0,3, gana la más cercana a la sonda. Un humano imperfecto acierta 2 de cada 3 primeras pulsaciones desde siempre; el 11,6 % de las veces actúa sobre la estación vecina (sobre todo horno y "meter al horno", filas de mesas pegadas).
3. **Agrandar el círculo con la misma regla empeora** (63,8 %): la sonda cae sobre la vecina. Con orientación perfecta sube a 83 %, no a 100: el resto es elegir mal entre vecinas. Hay que puntuar candidatas, no agrandar el alcance.
4. La latencia (60-150 ms) cuesta 10 pp en 1ª pulsación y 330 ms: el magnetismo debe orientar solo y perdonar la parada.
5. El Ayudante (alcance ×1,5, auto-orientación) llega a 84,7 / 93,4: es la referencia de lo que el magnetismo debe dar a todos.
6. Lo que sí cambió con el tiempo y no mide este bot: más presión de tiempo (pizza que se quema a los 8 s, eventos, rata), no más dificultad de apuntar. La rata (bloque 3) sí castiga el control: se mide aparte.

No medido aquí: jitter real de red y celular, fps de la pantalla.

## Magnetismo (shared/feel/magnet.ts, flag `magnet`, apagado por defecto)

| Normal, solo | 1ª puls. % | acierto % | equivocada % | t med ms | t p90 ms | 4 chefs 1ª % | 4 chefs acierto % |
|---|---|---|---|---|---|---|---|
| master, flag apagado | 67,7 | 86,5 | 11,6 | 2417 | 4217 | 68,9 | 87,2 |
| **magnet normal** | **92,2** | **96,5** | 3,3 | 2200 | 3950 | 90,7 | 96,2 |
| Difícil, flag apagado → magnet normal | 66,3 → 90,6 | 84,7 → 96,1 | 12,8 → 3,4 | 2300 → 2150 | 4017 → 3850 | 65,7 → 90,1 | 84,1 → 95,5 |
| Fácil, flag apagado → magnet strong | 66,3 → 92,2 | 84,7 → 96,9 | 12,8 → 2,6 | 2300 → 2133 | 4017 → 3817 | 65,7 → 91,4 | 84,1 → 96,0 |
| Ayudante + magnet (el Ayudante conserva su regla) | 84,7 | 93,4 | 6,1 | 2183 | 3883 | 86,0 | 93,4 |

Meta ≥ 90 % en Normal: **92,2 % a la 1ª pulsación y 96,5 % de acierto** (de 67,7 / 86,5), con 4 chefs 90,7 / 96,2. Tiempo por interacción -217 ms (-9 %).

Qué hace: (1) estación objetivo por puntaje (distancia del cuerpo al borde menos un bono pequeño por la dirección, cono de 80°, alcance ×1,3, sin atravesar paredes, solo las del equipo); (2) Tomar/Picar giran al chef hacia su objetivo; (3) imán: un chef lento a menos de 0,6 tile de una estación gira hacia ella a 720°/s (el palo siempre manda; nunca mueve al chef); (4) el dash que termina a menos de 0,9 tile de una estación justo delante sigue hasta pegarse; (5) τ 60/50 → 35/30 ms, dash 600 → 450 ms, buffer 150 → 200 ms. El Ayudante conserva ×1,5 y suma 0,2 más. El dash solo se bloquea con lo que encuentra la sonda antigua (o un Picar real): caminar por una fila de mesas y pulsar B sigue siendo dash. Lobby: Normal y Difícil `normal`, Fácil `strong`; la opción `magnet: false` lo apaga.

### TUNING (tabla `MAGNET_TUNING` en shared/feel/magnet.ts)

| valor | normal | strong (Fácil) | antes |
|---|---|---|---|
| reachMult (× 1,1 tile) | 1,3 | 1,5 | 1,0 |
| assistExtra (suma a ×1,5) | 0,2 | 0,2 | 0 |
| coneDeg | 80 | 85 | sonda sin cono |
| facingBonus (tiles) | 0,1 | 0,08 | n/a (barrido: 0,5 → 75 % / 0,3 → 82 % / 0,2 → 86 % / 0,1 → 92 % de 1ª pulsación) |
| pullDps / pullGap / pullSpeed | 720 / 0,6 / 1,5 | 1080 / 0,8 / 2 | sin imán |
| hugMax / hugConeDeg | 0,9 / 30 | 1,1 / 40 | sin abrazo |
| tauMs / tauStopMs (mín. con el de la dificultad) | 35 / 30 | 25 / 20 | 60 / 50 (Normal), 0 (Fácil/Difícil) |
| dashCdMs (mín.) / bufferMs (máx.) | 450 / 200 | 400 / 250 | 600 / 150 |

Barrido de τ con el magnetismo encendido (acierto no cambia dentro del ruido; el tiempo sí): 60/50 → 2267 ms, 45/40 → 2250, 35/30 → 2200, 20/20 → 2167, 0/0 → 2150. Se eligió 35/30: -67 ms sin perder el deslizamiento.

Reproducir: `npx tsx tools/feel-measure.ts <checkout> --reps 8 [--chefs 4] [--difficulty easy] [--opts '{"magnet":true}']`; los checkouts viejos con `git archive <sha> shared | tar -x -C <dir>`.

## La rata (shared/feel/rat.ts, detrás del mismo flag `magnet`)

Bot imperfecto (`shared/feel/rat-bot.ts`, `tools/rat-measure.ts`): 15 mapas × 12 semillas, el chef nota la rata a los 0,5-1,5 s, la persigue con palo ruidoso y 60-150 ms de retraso, hace dash a 1,5-2,6 tiles; la mitad de las veces con las manos llenas (el dash exige manos libres). El evento se fuerza a los 3 s con 2 mesones con ítem.

| Normal | espantada en su ventana | manos libres | manos llenas | robó | ítem perdido (robó y nadie la espantó) | robo más temprano | vida mínima de una rata no espantada |
|---|---|---|---|---|---|---|---|
| rata vieja (flag apagado) | 23,3 % | 50,0 % | **0,0 %** | 80,0 % | 73,3 % | 17 ms | 33 ms |
| rata gentil (flag encendido) | **84,4 %** | 84,5 % | 84,4 % | 41,7 % | 12,2 % | 1033 ms | 12 033 ms |

Por qué costaba: la rata nace en un hoyo pegado a un mesón, roba en el primer tick (17 ms) y ya está en la salida (33 ms de ventana); va a 2,4 tiles/s en zigzag por centros de casilla; solo la espanta un dash a menos de 1,1 tile, y un cocinero con las manos llenas no puede hacer dash nunca.

Qué cambia (`RAT_GENTLE`): velocidad 2,4 → 1,68 (70 %), tramos rectos de 1,6 s con giro suave (360°/s) y pausa de 0,7 s; no roba en su primer segundo y no se va antes de 12 s (con botín se queda comiendo en el mesón, sin botín espera 14 s; antes 10 s); radio de espanto con dash 1,1 → 1,5, un dash terminado hace menos de 250 ms sigue valiendo hasta 1,9 tiles, y chocar corriendo con ella (≥1,2 tiles/s a menos de 0,6) la espanta aunque lleves las manos llenas; premio de 50 puntos al equipo (más un ding); telegrafía: evento `rat:target` (flecha sobre la rata, línea punteada y aro hasta el mesón que va a robar, sonido `ratTarget`) y `rat:near` a 2,2 tiles (destello de alarma, tres pitidos). El texto de la píldora dice "Dash o choca con ella: +50".
