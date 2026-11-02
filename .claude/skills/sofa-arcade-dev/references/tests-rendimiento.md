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

## Qué comando según la situación

| Situación | Comando |
|---|---|
| Toqué un paquete | `npm run test:agent -- --project <proyecto>` |
| Quiero saber si rompí algo, rápido | `npm run test:changed` (solo `!slow`, relativo a `origin/master`, incluye lo sin commitear) |
| Antes del PR (equivale a CI) | `npm run test:quick` |
| Toqué `step`/sim/validador/generador/protocolo | `npm run test:slow` (o `npm run test:full`, limitado) |
| Integración | `PG_TEST_WORKERS=50% nice -n 10 npm run baseline:check` |
| Máxima velocidad sin importar el Mac | `npm test` (sin tope) |

Ojo: `test:changed` corre todo si cambia `vitest.config.ts` o un archivo del que dependen muchos (por ejemplo `platform/core/src/rng.ts` arrastra casi todo el grafo); y un cambio de `harness.ts` lanza los tests con Chrome si quitas `--project '!slow'`. No reemplaza a `test:quick` antes de integrar.

## GPU

No aprovechable para vitest: corre en Node y los tests son sim determinista en CPU (un solo hilo por worker, sin kernels paralelizables); pasar eso a GPU exige reescribir el sim y rompería el determinismo bit a bit de los goldens. En Chrome, lo contrario: los tests de layout del celular no necesitan GPU y `--disable-gpu` baja 28 % de CPU. Las capturas y el `smoke` sí renderizan WebGL (Phaser); ahí la GPU solo cambiaría los píxeles (hashes en el baseline) y CI usa SwiftShader, así que no se toca.

## Ideas pendientes

- El wall de `layout.slow` (317 s) es de `sleep()` en `harness.ts` (300+250+120 ms por escenario): sustituir por esperas de condición (`waitFor` sobre el DOM) lo bajaría a una fracción; no se hizo por riesgo de flaky. `harness.ts` está en su tope de líneas (810).
- Partir `layout.slow` / `generate.slow` (500 seeds) en varios archivos o `describe.concurrent` para repartir entre workers, o reducir seeds solo en local con una env (sin perder la corrida completa en integración).
- `isolate: false` en `game-pizzas` solo para los archivos sim puros (separar los de `screen/` con DOM en otro proyecto): ahorraría ~40 % de los 75 s de CPU.
- Cache de transformaciones de vitest (`experimental.fsModuleCache`): no se probó.
- `scripts/move.ts` regenera `vitest.config.ts` desde una plantilla ya desactualizada (sin `catalog`/`arena`): si se vuelve a usar, hay que sincronizar la plantilla con esta config.
