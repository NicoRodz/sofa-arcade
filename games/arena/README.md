# Manchazo (`@pichi/game-arena`, antes Arena de empujones)

Dos equipos (naranja y azul, 2 a 8 jugadores) sueltan piñatas que pintan el piso de una grilla de 27x15; gana quien deje más casillas de su color. Está `soon: true`: el menú de la TV lo oculta salvo con `?soon=1`. No toca `platform/`: usa solo el contrato (`GameManifest`, `GameProtocol`, `ScreenGame`, `ControllerGame`).

## Reglas

- Stick para moverte (4 direcciones, esquinas asistidas), botón 1 suelta una piñata, botón 2 juega el sabotaje en mano. Máx. 2 piñatas vivas por jugador; el equipo menor recibe radio +1 y una piñata de reserva por jugador que falta (`handicap: 'game'`).
- La piñata estalla a los 2 s y pinta un rombo de radio 2 (los muebles lo cortan); otra piñata alcanzada estalla 0,15 s después (cadena). Quien recibe el estallido rival queda quieto 1,2 s y luego deja 3 s de huellas del color rival.
- Ronda de 75 s (2-4 jugadores), 90 s (5-6) o 105 s (7-8). Gana quien tenga más casillas; empate: quien llegó antes a ese número; mismo tick: empate (`sim/match/result.ts`).
- Mapa por semilla (`map/gen/`): mitad izquierda + columna central, muebles con cuota por banda, espejo, validadores V1-V7 y reintento hasta 64 veces (si no, el mapa F0). `mapSeedFor(lobbySeed, ronda)` da una semilla por ronda; la TV la muestra (`MAPA 2·7KQ2M`).

## Sabotajes (`sim/sabotage/`, flag `sabotage`)

Mazo por semilla (`seed ^ DECK_SEED_TAG`), 3 pares espejo de recogibles que vuelven a los 12 s. Aguarrás (la siguiente piñata borra), Rodillo (3 s pintando recto), Ventilador (empuja piñatas a 4 casillas), Huellas (5 s de pintar de tu color al que se mueve) y Pegote (la piñata se pega al rival a 6 casillas). Efecto y contra de cada uno en `kinds.ts`. Con `sabotagePlus` (apagado: F5 bit a bit) entran Cinta, Tinta invisible, Esponja, Cambiazo y Mareo (`PLUS_SABOTAGES`; tests en `test/sabotage-plus/`).

## Eventos (`sim/events/`, flag `events`)

3 de 4 eventos por ronda en franjas de 25 %, 46 % y 67 % (+-4 %, ninguno en los últimos 12 s): Gran piñata (radio 5), Lluvia (lava una banda de 3 filas), Casillas doradas (valen doble 15 s) y Robot aspiradora (limpia 3 columnas). Además: Remontada (+1 de radio al que pierde por más de 15 %, 10 s), Marcador oculto (últimos 10 s) y Reloj de arena disputado (`clock.ts`). Cada anuncio queda en `ev.log`; la TV lo muestra y cada celular vibra.

## Mapa vivo (`sim/living/` y `map/gen/living*.ts`, flag `living`)

La TV enciende `sabotage`, `events` y `living` (`screen/match/run.ts`); sin `living` la ronda y su hash son los de F4 (`test/living/f4-parity.test.ts`). Pares espejo, con aviso de 1 s antes de cada cambio: brocha (gira 90 grados cada 4 s y pinta lo que barre con el color de quien pisó el pivote; empieza neutra) y sofá (se desliza por un riel de 3 casillas cada 5 s). Fuente central (13, 7): cada 8 s, el equipo con más cuerpos a 2 casillas pinta las 12 de alrededor (empate: las limpia; nadie: nada). Regla de empuje (`push.ts`): un cuerpo se empuja en el sentido del movimiento hasta pisar piso (máx. 3 casillas), nunca a través de un mueble; una piñata no se mueve; si algo no cabe, el par espera entero. V1-V3 valen en todas las combinaciones de estados, así que nadie queda encerrado. El desfase de cada elemento sale de la semilla del mapa.

## Rescate y Botín (`sim/rescue/`, flag `rescue`)

Rescate: un compañero no manchado en tu casilla o en una ortogonal 12 ticks seguidos te libera (sin huellas rivales); si el contacto se corta, el conteo vuelve a 0; ambos brillan 30 ticks. Botín: al mancharte, tu carta cae en la casilla válida más cercana (nunca muro, parte viva, fuente, recogible ni otro botín) 240 ticks; tú no la tomas los primeros 120, otro sí; si dos la pisan en el mismo tick nadie la toma; si nadie, vuelve a su recogible. Sin el flag la ronda es la de PR2 bit a bit (`test/rescue/flag.test.ts`). Captura: `manchazo-rescue-tv`.

## Carpetas

| Ruta | Qué hay |
|---|---|
| `manifest.ts`, `protocol.ts`, `index.ts` | Manifest (modo único, equipos, controles, howTo) y protocolo (solo el id); sin Phaser |
| `map/` | `tile-map.ts` (grilla y mapa F0), `layout.ts`; `gen/`: generador, validadores V1-V7, muebles, semilla y mapa vivo (`living*.ts`) |
| `sim/grid/` | Cuerpos en enteros de 1/16 de casilla a 60 Hz, movimiento, control (planes A y B), hash |
| `sim/match/` | Ronda: crear, tick, piñatas, estallidos, pintura, resultado, lobby, hash |
| `sim/sabotage/`, `events/`, `living/`, `rescue/` | Un flag cada uno; azar solo en substreams con tag |
| `sim/state.ts`, `sim/step.ts` | Arena de empujones original (sin `?control` ni Manchazo) |
| `screen/`, `screen/match/`, `screen/grid/` | `game.ts` (el `ScreenGame`), `match/` (ronda, escena, HUD, banner de eventos, pistas del celular), `grid/` (prototipo F0 `?control=A\|B`) |
| `controller/` | Línea del lobby; el pad llega con el manifest |
| `test/` | `sim`, `map-*`, `match-*`, `grid-*`, `conformance` (`checkGame`); `sabotage/`, `events/`, `living/` por flag |
Pruébalo con `npm run dev` y `?soon=1`; capturas: `npx tsx tools/capture.ts manchazo-living-tv`.
