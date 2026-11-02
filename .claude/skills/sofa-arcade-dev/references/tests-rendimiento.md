# Tests: consumo de CPU y qué correr

Medido el 2-nov-2026 en el Mac de Nico (10 núcleos: 4 P + 6 E, `sysctl hw.ncpu`), vitest 5.0.5, Node 25.8, con `/usr/bin/time -l` y de a un proyecto. "CPU" = user + sys en segundos; "núcleos prom." = CPU / wall.

## Diagnóstico

- Config original: pool `forks` (default), `isolate: true`, sin `maxWorkers` => vitest levanta `núcleos - 1` = **9 workers**. `test:fast` corre 252 archivos / 2706 tests en 20 s con ~7 núcleos promedio y picos de load 11 sobre 10 núcleos: eso es el "Mac a tope".
- Dos costos distintos: (1) los proyectos `game-pizzas` y `game-obstaculos` son CPU puro del sim (75 y 26 s de CPU); (2) el proyecto `slow` (35 archivos, 330 tests) tarda **319 s de wall y 767 s de CPU** (645 user + 122 sys); manda el camino crítico de un solo archivo con Chrome.
- Quién abre Chrome: solo `apps/controller/test/*.slow.test.ts` (4 archivos; `harness.ts` levanta Vite + Chrome headless por archivo, puerto `PG_PORT`/`PG_CDP_PORT`). `layout.slow` = 317 s, `menu-layout.slow` = 81 s; el wall es sobre todo `sleep()` de 100-300 ms por escenario. Fuera de vitest: `tools/capture`, `smoke`, `obst-e2e`, `lobby-games-e2e`, `menu-remote-e2e`. Quién abre server (sin Chrome): `apps/server/test/*.ws*.test.ts`, `relay*.test.ts`, `games/obstaculos/server/expeditions.test.ts`.
- `npm test` = `vitest run` (todo, incluido slow). CI (`ci.yml`, job `check`) = lint, typecheck, `test:fast`, deps, check-new-files; job `smoke` = build + `npm run smoke` (Chrome con SwiftShader). El slow no corre en CI. `baseline:check` = `vitest run` completo con reporter JSON y compara nombres, skips, 0 tests y hashes de `docs/screens` y goldens; ~5-6 min de wall aquí.
- Top de lo lento (wall, con contención):

| Archivo | s |
|---|---|
| apps/controller/test/layout.slow.test.ts (Chrome) | 316 |
| games/obstaculos/generate/generate.slow.test.ts | 199 (un test de 500 seeds = 109 s) |
| apps/controller/test/menu-layout.slow.test.ts (Chrome) | 82 |
| games/pizzas/test/mech/kneader/bot.slow.test.ts | 53 |
| games/pizzas/test/mech/gen/play.slow.test.ts | 42 |
| games/pizzas/sim/generate.slow.test.ts | 42 |
| games/pizzas/sim/generate.versus.slow.test.ts | 26 |
| mech/gate, beltReverse, ovenHeat bot.slow | 25, 23, 20 |
| learning.slow (obst), patches-play.slow, t2.golden.slow | 18, 18, 16 |

  Tests individuales más lentos: `layout` landscape 132 s y portrait 102 s; `generateLevel 500 seeds` 109 s y `full matrix` 51 s; `menu-layout` landscape 31 s; `generateVersus 500 seeds` 24 s. En `test:fast` lo más lento son `recipes.v2.test.ts` (11,7 s), `recipes.mirror.test.ts` (9,4 s), `stars-final.test.ts` (3,9 s), `recipes.cook.test.ts` (3,7 s), `mech/gen/core.test.ts` (3,5 s); el resto <3,2 s.

## Qué cambió

1. `PG_TEST_WORKERS` (número o `%`) fija `maxWorkers` en `vitest.config.ts`. Sin la variable (CI, `npm test`, `test:fast`, `baseline:check`) no cambia nada. (`VITEST_MAX_WORKERS` existe, pero hace `parseInt` y `50%` se vuelve 50.)
2. Scripts locales con `PG_TEST_WORKERS=50% nice -n 10`: `test:quick`, `test:changed`, `test:full`, y `test:agent` (ahora también limitado).
3. `isolate: false` solo en los proyectos `core` y `game-obstaculos` (puros). Se probó en todo `test:fast`: falla (`game-pizzas` usa DOM falso y estado de módulo: `createTreeWalker is not a function`, fallos distintos en cada corrida), así que **no** se generaliza. En `core` y `game-obstaculos` pasó 3 corridas normales y 4 con `--sequence.shuffle.files --sequence.shuffle.tests` (seeds 1, 7, 42, 99).
4. Chrome del harness del celular con `--disable-gpu` (`apps/controller/test/harness.ts`). No se tocó `tools/capture/browser.ts`: ahí la salida son píxeles hasheados.

## Antes / después

| Corrida | Antes (wall / CPU / núcleos prom.) | Después (wall / CPU / núcleos prom.) |
|---|---|---|
| `test:fast` (2706 tests) -> `test:quick` | 19,9 s / 142 s / 7,1 | 22,8 s / 117 s / 5,1 (-18 % CPU, +15 % wall) |
| `test:fast` sin env (lo que corre CI) | 19,9 s / 142 s | 19,0 s / 130 s (solo por no-isolate) |
| `--project core` | 2,74 s / 6,3 s | 1,50 s / 3,2 s |
| `--project game-obstaculos` | 3,92 s / 25,8 s | 2,85 s / 16,1 s |
| `--project game-pizzas` | 11,4 s / 75,0 s | 13,5 s / 77,6 s (5 workers: mismo trabajo, menos picos) |
| `menu-layout.slow` (Chrome) | 83,3 s / 69,6 s | 83,4 s / 50,1 s (-28 % CPU, mismo wall) |
| `test:changed` tras tocar `games/arena/sim/index.ts` | 19,9 s / 142 s (`test:fast`) | 0,73 s / 1,1 s (2 archivos, 15 tests) |

Con 3 workers en `test:fast`: 31 s / 106 s / 3,4 núcleos (más lento, no vale la pena). `nice` no cambia el CPU total, solo cede prioridad al resto del Mac; no se mide en la tabla.
No se re-corrió el proyecto `slow` completo después del cambio (orden de Nico: Mac saturado); solo se midió `menu-layout`. Las cifras de CPU de Chrome vienen del rusage de los hijos esperados: son aproximadas.

## Qué corre el CI de GitHub y qué no

`.github/workflows/ci.yml` (en PR y en push a master). Este PR no lo modifica.

| Job | Corre | NO corre |
|---|---|---|
| `check` | `npm ci`, `lint`, `typecheck`, `test:fast` (todos los proyectos salvo `slow`, sin `PG_TEST_WORKERS`), `deps`, `check-new-files` (solo PR) | proyecto `slow` (35 archivos, 330 tests), `baseline:check` (nombres, skips, hashes de `docs/screens` y goldens), `test:full`, `npm test` |
| `smoke` | `build` + `npm run smoke` (pantalla `/screen` y celular `/c` en Chrome headless con SwiftShader) | `tools/capture`, `obst-e2e`, `lobby-games-e2e`, `menu-remote-e2e`, los 4 `*.slow` con Chrome de `apps/controller` |

Verde en el CI no cubre `step`/sim/validador/generador/protocolo en sus pruebas lentas ni los goldens: eso solo lo ven `test:slow` / `baseline:check` en local.

## Política de pruebas por etapa

- Durante una etapa: `test:changed` o `test:quick`, más los `*.slow` que toque el cambio (`npx vitest run <archivo>.slow.test.ts`).
- Al cerrar cada etapa: el CI de GitHub (PR).
- Suite completa local (`test:full` + `baseline:check`): solo 1 o 2 veces por desarrollo grande, en hitos.

## Qué comando según la situación

| Situación | Comando |
|---|---|
| Toqué un paquete | `npm run test:agent -- --project <proyecto>` |
| Quiero saber si rompí algo, rápido | `npm run test:changed` (solo `!slow`, relativo a `origin/master`, incluye lo sin commitear) |
| Antes del PR (equivale al paso `test:fast` del CI, no a todo el CI) | `npm run test:quick` |
| Toqué `step`/sim/validador/generador/protocolo | `npm run test:slow` (o `npm run test:full`, limitado) |
| Integración | `PG_TEST_WORKERS=50% nice -n 10 npm run baseline:check` |
| Máxima velocidad sin importar el Mac | `npm test` (sin tope) |

Ojo: `test:changed` corre todo si cambia `vitest.config.ts` o un archivo del que dependen muchos (por ejemplo `platform/core/src/rng.ts` arrastra casi todo el grafo); y un cambio de `harness.ts` lanza los tests con Chrome si quitas `--project '!slow'`. No reemplaza a `test:quick` antes de integrar.

## GPU

No aprovechable para vitest: corre en Node y los tests son sim determinista en CPU (un solo hilo por worker, sin kernels paralelizables); pasar eso a GPU exige reescribir el sim y rompería el determinismo bit a bit de los goldens. En Chrome, lo contrario: los tests de layout del celular no necesitan GPU y `--disable-gpu` baja 28 % de CPU. Las capturas y el `smoke` sí renderizan WebGL (Phaser); ahí la GPU solo cambiaría los píxeles (hashes en el baseline) y CI usa SwiftShader, así que no se toca.

## Segunda ronda (2-nov-2026): esperas por condición en el harness de Chrome

Medición inicial de `slow` (35 archivos, 330 tests, `--reporter=verbose`, 9 workers, Mac compartido con carga ~5): 317 s de wall. Origen del tiempo: `layout.slow` 314 s = `sleep()` fijos del harness (`load` 60+300+250+120 ms más 15 ms por mensaje, `setViewport` 60 ms, `tap` 350 ms; ~660 `setViewport` y ~80 `load` por corrida) y el wall de un solo Chrome para los dos tests largos (landscape 132 s, portrait 102 s); `menu-layout` 82 s por lo mismo. Arranque de Chrome + Vite: ~2 s por sesión, no pesa. No hay build en `slow` (Vite en modo dev). `generate.slow` (obstáculos) 198 s es CPU puro de `generateLevel` (un solo test de 500 seeds = 107 s).

Qué se cambió:

1. `apps/controller/test/settle.ts` (nuevo): `settleJs()` espera en la página el viewport pedido, 2 frames y las transiciones/animaciones cortas (<= 400 ms; las que se repiten se ignoran), con techo de 1,5 s; `waitUntil()` hace polling con techo. El harness lo usa en `load`, `setViewport`, `tap` y `hold`; `load` espera además `readyState === 'complete'` del documento NUEVO (marca `window.__old`) y `window.__wsOpen()` (nuevo en el WebSocket falso) en vez de 300 + 250 ms.
2. `menu-layout`, `creator-flow` y `layout.slow`: sleeps de asentamiento por `settleJs`; el "Sí" de la confirmación (muerto 500 ms, repinta con un timer) se espera con `yesLive()` (techo 3 s) y el aviso del Ayudante con `waitUntil` (mismo techo de 3,5 s, vuelve apenas desaparece). Los asserts no cambian; los `sleep` que son semántica de tiempo se conservan donde no había condición observable.
3. Los dos tests largos de `layout.slow` (landscape y portrait) son `it.concurrent` y cada uno abre su propia sesión (Chrome + Vite, puertos libres de `free-port.ts`); el resto del archivo sigue en la sesión compartida.
4. `harness.ts` usa `tools/proc/kill-tree.ts` (antes tenía una copia): ahora espera hasta que el árbol muera (techo `graceMs`) en vez de 500-600 ms fijos, y SIGKILL solo a lo que sobreviva. Sigue siendo por PID. `harness.ts` baja de 810 a 769 líneas (`size-budget.json` ajustado con `size:ratchet`).
5. `slowProject` con `testTimeout: 120_000`: con todos los núcleos ocupados `kneader N=8` pasó de 16 s a 32 s y cayó en el tope de 30 s (una corrida roja antes de este cambio). Solo detiene cuelgues; no toca asserts.

No se tocaron capturas, hashes ni goldens (`baseline:check` verde: 3036 tests, hashes sin cambio, sin reintentos).

### Antes / después (wall por archivo, `--project slow`, 9 workers, Mac cargado)

| Archivo | Antes (s) | Después, 3 corridas (s) |
|---|---|---|
| `apps/controller/test/layout.slow.test.ts` | 314 | 117 / 115 / 117 |
| `apps/controller/test/menu-layout.slow.test.ts` | 82 | 44 / 42 / 42 |
| `games/obstaculos/generate/generate.slow.test.ts` | 198 | 224 / 215 / 222 |
| `games/pizzas/test/mech/kneader/bot.slow.test.ts` | 53 | 99 / 96 / 97 |
| `games/pizzas/test/mech/gen/play.slow.test.ts` | 43 | 79 / 75 / 77 |
| `games/pizzas/sim/generate.slow.test.ts` | 42 | 63 / 59 / 61 |
| `games/pizzas/sim/generate.versus.slow.test.ts` | 25 | 42 / 40 / 41 |
| `mech/gate`, `beltReverse`, `ovenHeat` bot.slow | 25 / 23 / 20 | 47 / 45 / 47, 45 / 42 / 44, 30 / 30 / 29 |
| **`slow` completo (wall)** | **317** | **224 / 216 / 222** |

Los archivos de sim puro subieron de wall porque antes los sleeps de Chrome dejaban núcleos libres; ahora los 9 workers compiten solo por CPU. El CPU total de esos archivos no cambió. `baseline:check` (`PG_TEST_WORKERS=50% nice -n 10`, corre fast + slow completos, 3036 tests): 236 s de wall (antes ~5-6 min). `test:full` ya es un subconjunto de `baseline:check`: no hace falta correr los dos.

### Lo que no baja de 3 min y por qué

El piso es `generate.slow` de obstáculos: ~145 s solo en una máquina quieta, ~220 s con carga, de los cuales un test de 500 seeds ocupa ~100 s en un solo hilo. Un test síncrono no se reparte entre workers y partir el archivo en dos exigiría extender `baseline-moves.ts` (hoy solo mapea archivo a archivo). Vitest corre ese código ~1,65x más lento que `tsx` (500 seeds sin revalidar: 35 s en tsx; mismo trabajo en vitest ~60 s): las importaciones entre módulos pasan por getters del transform SSR. `experimental.viteModuleRunner=false` se probó y no arranca (imports sin extensión).

## Ideas pendientes (segunda ronda)

- Partir `generate.slow` (obstáculos) y `generate.slow` / `play.slow` (pizzas) por test en archivos distintos, con soporte de partición en `tools/meta/baseline-moves.ts` (un archivo viejo -> varios). Es lo único que baja `slow` bajo ~100 s.
- Acelerar `generateLevel` (hot spots: `boxTouches`, `stepPlayer`, `simPlan`): exige probar que la salida sigue idéntica seed a seed; va detrás de un PR propio.
- `menu-layout` landscape/portrait en `it.concurrent` con sesión propia (hoy 42 s, ahorraría ~15 s).
- Compartir un solo Chrome (una pestaña por sesión) en vez de Chrome + Vite por sesión; hoy el arranque cuesta ~2 s, no es prioridad.
- Subir `slow` a 3 workers fijos en `test:full` solo si se parte lo anterior; con el piso actual no cambia el wall.

## Ideas pendientes (primera ronda)

- (Hecho en la segunda ronda) esperas por condición en `harness.ts`.
- Partir `layout.slow` / `generate.slow` (500 seeds) en varios archivos o `describe.concurrent` para repartir entre workers, o reducir seeds solo en local con una env (sin perder la corrida completa en integración).
- `isolate: false` en `game-pizzas` solo para los archivos sim puros (separar los de `screen/` con DOM en otro proyecto): ahorraría ~40 % de los 75 s de CPU.
- Cache de transformaciones de vitest (`experimental.fsModuleCache`): no se probó.
- `scripts/move.ts` regenera `vitest.config.ts` desde una plantilla ya desactualizada (sin `catalog`/`arena`): si se vuelve a usar, hay que sincronizar la plantilla con esta config.
