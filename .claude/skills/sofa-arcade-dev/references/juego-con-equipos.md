# Receta: un juego nuevo con equipos y modos

Modelos reales: `games/arena/` (el paquete mínimo: manifest, sim, screen, controller, `soon`, sin equipos) y Pizzas versus (modos, equipos, `makeTeams`, resultado por equipo). Guía para Manchazo (`/Users/nicorodz/.claude/plans/manchazo-plan.html`: 2 equipos naranja/azul, 2 a 8 jugadores, `handicap: 'game'`). Todo en `games/<id>/` y las raíces `apps/`; **no se toca `platform/`**. Si el contrato no alcanza, detente y repórtalo.

Cada paso termina en un PR pequeño contra `master` (ver SKILL.md). Puertos propios y `npm ci` antes de nada.

## Paso 0: decisión de ruta

- **Paquete nuevo** (`games/manchazo/`): sigue los pasos 1 a 12.
- **Evolucionar Arena** (el plan de Manchazo, F1, habilita equipos en `games/arena`): omite el paso 1 y ve al 2. Ojo con lo que ya está fijado en el baseline: `games/arena/test/conformance.test.ts` clava `id`, `name` y `blurb` de Arena; `game.ts:31` fuerza `pickReset: { modeId: 'coop', teams: null }` y `screen/lobby.ts` llama `showTeams(false)` y deja `noOptions: true`. Cambiarlos cambia tests y capturas del baseline: el PR lo explica y lleva el OK de Nico. No renombres tests; si el nombre del juego cambia, el test de nombre se actualiza con justificación.
- `ModeId` solo admite `coop | versus | ffa | teams | race` (`platform/core/src/contract/options.ts`). Naranja contra azul es `versus`. Un id de modo nuevo es cambio de plataforma: no.

## 1. Esqueleto del paquete (copia `games/arena/`)

- `package.json` (`@pichi/game-<id>`, `exports` `.`, `./sim`, `./screen`, `./controller`), `tsconfig.json`, `README.md` <=40 líneas.
- `vitest.config.ts`: línea nueva en `packages` (`'game-<id>': ['games/<id>']`). `<id>` en kebab-case: viaja en el protocolo.
- Dependencias `@pichi/game-<id>` en `apps/catalog`, `apps/screen` y `apps/controller` (`package.json`). Corre `npm install` para que `package-lock.json` enlace el workspace y commitea el lock.
- Un `index.ts` por carpeta, solo re-exports (<=40 líneas). Archivos <=300 líneas, sin `utils.ts`.

## 2. `ModeSpec` y `TeamSpec` en `manifest.ts`

```ts
modes: [{
  id: 'versus', label: 'Naranja contra azul', players: [2, 8],
  teams: { count: [2, 2], maxRatio: <N>, handicap: 'game', styles: STYLES },
  howTo: { steps: [/* 3 a 4 pasos */] },
}],
defaultMode: 'versus',
```

- `handicap`: `'score-k'` multiplica puntos (Pizzas), `'game'` es regla propia del juego (Manchazo: +1 de radio y piñatas de reserva; la plataforma no calcula nada), `'none'` nada.
- `maxRatio`: mayor/menor equipo que el lobby acepta (1 = solo parejos). Con `'game'` decide el valor con el plan (1 contra 4 = 4) y pruébalo.
- `styles`: un `TeamStyle { name, color, icon }` por equipo (>= `count[1]`). El ícono es un glifo: el color solo no distingue equipos (daltonismo). Elige colores lejos de los de los avatares (ver el comentario de `VERSUS_STYLES` en `games/pizzas/manifest.ts`).
- Con un solo modo declarado el lobby no muestra selector (`hasModeChoice`). `soon` en un `ModeSpec` oculta ese modo; si **todos** son `soon`, `gameProblems` falla (`none is selectable`). Para ocultar el juego usa `soon: true` en el manifest (campo extra, como Arena), no en el modo.
- Límites que `checkGame` hace cumplir: etiquetas de control <=14 caracteres, íconos de `platform/core/src/icons.ts`, howTo de 3 a 4 pasos de <=70 caracteres, `players` del modo dentro de `minPlayers`/`maxPlayers`.
- Manifest con `as const satisfies GameManifest & { soon: boolean }` (modelo: `games/arena/manifest.ts`).

## 3. `protocol.ts`

`{ game: '<id>' }` basta si no hay mapas, puestos ni señales. Si la tele manda un veredicto por equipo al celular, agrega `parseResult` (modelo: `games/pizzas/protocol.ts` y `sim/versus/phone-result.ts`). Las ranuras opacas (`map`, `result`) no cambian el cable: no subas `PROTOCOL_VERSION`.

## 4. Lobby y equipos (puro, en `sim/lobby.ts`)

La tele es la dueña de los equipos; el relay solo lee `config.teams` (`platform/server/src/relay.ts:55`).

- `makeTeams(mode, playerIds, seed, previous?)` (`@pichi/core/lobby`) arma `TeamInfo[]` (`id`, `name`, `color`, `icon`, `playerIds`) o `null` si el modo no tiene equipos. Pasa `previous` en la revancha para conservarlos. Con 1 jugador da un solo equipo: el chequeo de inicio lo rechaza.
- `modeAvailability(mode, n)` da el motivo si faltan o sobran jugadores; `validateTeamSetup(mode, splitIds)` lista problemas (`Hay un equipo vacío`, desiguales). Para Manchazo el mínimo es 2 (uno contra uno).
- `joinSmallestTeam`, `leaveTeams`, `movePlayer`, `reshuffleTeams`, `balanceTeams`: mismos helpers. Modelo completo: `games/pizzas/sim/versus/lobby.ts` (`syncTeams`, `versusAvailability`). Cópialo en tu paquete adaptado; **importarlo de Pizzas rompe `no-cross-game`**.
- Las ventajas del equipo chico (`handicap: 'game'`) salen de `teamSizes` al armar la ronda (`startMatch`), no de un flag global.
- Test (modelo: `platform/core/src/lobby/teams.test.ts`): 2, 3, 5, 7 y 8 jugadores; 1 jugador no inicia; revancha conserva equipos; entra o sale un jugador a mitad de lobby.

## 5. Sim puro y determinista (`sim/`)

- `create<Game>(config)` y `step(state, inputs, dtMs)`; sin DOM, Node, `Math.random` ni reloj. Todo el azar sale de `mulberry32` (`@pichi/core`) con un substream por tag (`seed ^ <NOMBRE>_SEED_TAG`): mapa, mazo y eventos cada uno el suyo.
- Tick fijo de 60 Hz; los tiempos se escriben en segundos y se convierten a ticks al cargar (ver `games/arena/screen/run.ts`, `STEP_MS`).
- Tests: misma semilla, mismo hash a los N ticks; espejo (equipos intercambiados dan el resultado espejado: patrón `*.mirror.slow.test.ts` de Pizzas, en `.slow.test.ts` si es pesado); un mapa o generador lleva su test de jugabilidad (SKILL.md, "Mapas y niveles").

## 6. Pantalla (`screen/`): `ScreenGame`

Contrato en `platform/screen/src/shell/game.ts`; el shell no nombra juegos, cada rama es un hook:

| Hook | Qué haces |
|---|---|
| `lobby.pickReset` | Parche al elegir el juego: `{ modeId: 'versus', teams: null, teamsLocked: false, modeOptions: {} }`. Sin esto el relay rechaza la config por heredar equipos del juego anterior |
| `lobby.afterPick` / siembra de equipos | Ningún juego siembra equipos en `afterPick`: Pizzas los arma en `setMode` (`games/pizzas/screen/lobby/sync.ts:30-47`) y los reconcilia en cada pintado del lobby con `syncLobby` (`sync.ts:114-130`, llamado desde `lobby/lobby.ts:31`), que hace `patchConfig({ teams })` con `syncTeams`. Un juego de un solo modo no pasa por `setMode`: haz la misma reconciliación al inicio de tu `render` (`teams === null` -> `makeTeams`, y `patchConfig` solo si cambió). `afterPick` (`platform/screen/src/menu/view.ts:30`, corre tras `pickReset` y `dispatch('pick')`) solo lo usa Obstáculos (`camp.enter()`); déjalo sin definir. Verifica con `?soon=1` que la config llega al relay sin rechazo |
| `lobby.render` | Pinta tu mitad del lobby y muestra las columnas con `showTeams(true)` y `chips` de `@pichi/screen-kit/lobby`; quita `noOptions` si el juego tiene opciones |
| `startMatch` | Crea la ronda con equipos y tamaños; devuelve `MatchStart` o `undefined` (el pad llega del manifest) |
| `scenes`, `frame(delta)` | Escena Phaser; `frame` avanza el sim y, al terminar, `dispatch('timeout')` |
| `players.input` | Paquetes del celular -> sim (`m.x`, `m.y`, `m.presses`) |
| `results` | `render` y `scoreOf(id)` = puntaje del **equipo** del jugador (`teamOf(app.config.teams, id)`; orden con `rankTeams`) |
| `phaseExtras` | `result` para los celulares (solo si el protocolo lo declara) |
| `reset` | Olvida la ronda |

Pantallas nuevas en lit-html (SKILL.md, "Una pantalla lit-html"). Un jugador que se cae a mitad de ronda: ver `GHOST_MS` (`platform/core/src/lobby/teams.ts:27`) y `dropPlayer` (`games/pizzas/sim/versus/match.ts:64`).

## 7. Celular (`controller/`)

`ControllerGame { id, setupLabel(cfg) }`; stick y dos botones llegan con el manifest. El equipo de cada celular llega por el relay (`youMsg`). Si hay veredicto por equipo, pantallazo en el celular con color o sonido que llame la atención.

## 8. `checkGame` y conformidad

`test/conformance.test.ts` (modelo Arena): `expect(checkGame({ manifest, protocol, controller })).toEqual([])`; agrega que un catálogo rechaza un id duplicado y, si el juego es `soon`, que sigue anunciado. Además prueba el `ModeSpec`: `modeOf(manifest, 'versus').teams` y que `makeTeams` da 2 equipos con tus estilos.

## 9. Catálogo y raíces (`soon` mientras se desarrolla)

- `apps/catalog/src/games.ts`: el manifest en `IN_DEVELOPMENT` (`soon: true`); pasa a `GAMES` solo en el PR de lanzamiento. `apps/catalog/src/protocol.ts`: `DEV_PROTOCOL` (y `PROTOCOL` al publicar).
- Una línea en `apps/screen/src/games.ts` y otra en `apps/controller/src/games.ts`. La tele solo registra un juego `soon` si abre `?soon=1`.
- Test del relay (modelo `apps/server/test/relay-arena.test.ts`): solo la pantalla puede elegir un juego `soon`. Test de catálogo en `apps/catalog/test/catalog.test.ts`.
- `platform/` no puede escribir el id del juego (`tools/meta/agnostic.test.ts`).

## 10. Smoke y capturas

- `npm run build && PG_PORT=<libre> PG_CDP=<libre> npm run smoke`: `/screen/` y `/c/` sin errores de página. El smoke no abre `?soon=1`: tu juego `soon` se carga en el bundle pero no se ejerce. Súmale un e2e de lobby con `?soon=1` (modelo: el bloque `arena` de `tools/lobby-games-e2e.ts`, que corre con `PG_PORT`, `PG_CDP`, `LABEL`) y exige 0 `pageErrors`.
- Capturas en `docs/screens/<id>/` (Arena: `tv-menu-soon`, `tv-lobby`, `tv-howto`, `tv-play`, `phone-lobby`, `phone-play`): para equipos agrega lobby con los dos equipos y resultados. Escenarios en `tools/capture/scenarios/` registrados en `MODES` de `tools/capture/cli.ts` (modelo: `versus.ts`). Chrome se cierra por PID (`killTree`).

## 11. Gates antes del PR

`npm run lint`, `typecheck`, `test:agent -- --project game-<id>`, `test:fast`, `npm run deps`, `check:new-files`, `npm run build && npm run smoke`, `npx vitest run --project tools` (tamaños) y `npm run test:agent -- --project catalog`; `app-server` si tocaste el relay. `npm run baseline:check` al integrar. Sabotea cada test nuevo (equipos, espejo, determinismo) a mano, con commit antes.

## 12. Orden de PR sugerido

1) Esqueleto `soon` con manifest, `ModeSpec`/`TeamSpec`, lobby con equipos y conformidad (capturas del lobby). 2) Sim y tests. 3) Escena y celular. 4) Resultados por equipo. 5) Lanzamiento: de `IN_DEVELOPMENT` a `GAMES`, con baseline regrabado en PR explicado. Cambios de plataforma (render x2, arte, protocolo del plan de Manchazo: F6, F7, F9) van en sus propios PR aprobados por Nico, no aquí.
