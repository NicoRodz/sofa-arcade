# Pizzas (`@pichi/game-pizzas`)

Cocina coop y versus. `sim/` es código puro (sin DOM, Node ni Phaser); `screen/` y `controller/` lo consumen por `sim/index.ts`.

## Módulos de `sim/`

| Ruta | Qué hay |
|---|---|
| `index.ts` | API pública (la misma que tenía `overcooked.ts`). `overcooked.ts` es un re-export que sobrevive por quienes importan por nombre de archivo |
| `round/state.ts` | Tipos (`Game`, `Player`, `Station`, `TeamState`...) y constantes |
| `round/create.ts` | `createGame`, `addPlayer`, `removePlayer` |
| `round/step.ts` | `tick`: el orden de un tick |
| `round/chef.ts`, `chop.ts`, `movement.ts` | Un chef por tick: Picar (cortar, lavar, apagar, plegar), dash, caminar, colisiones |
| `round/hazards.ts`, `targeting.ts`, `stations.ts`, `orders.ts` | Resbalones y catapulta; estación objetivo (Ayudante, imán); A sobre cada estación y horno; colas, VIP, entrega |
| `versus/match.ts` | Fin de ronda, roster, fantasmas, pausa |
| `maps/` | `parse.ts`, `catalog.ts`, `lobby.ts`, `layouts/*.ts` (un mapa por archivo, son datos) |
| `validate/`, `generate/` | Validador de mapas (coop y versus) y generador con semilla |
| `mutate/` | Cocinas que mutan (flag `mutate`, apagado por defecto): un diff de tiles a 1:30 en los mapas 1, 2 y 4, aviso 3 s antes, sub-semilla propia (`seed ^ MUTATE_SEED_TAG`). `check.ts` valida el mapa antes y después. Versus lo excluye por ahora (habría que espejar el diff por sigma) |
| `burn`, `sabotage`, `midround`, `assist`, `recipes/`, `feel/`, `school/` | Reglas opcionales, cada una detrás de su flag |

## Invariantes

- **Orden de `tick`** (lo fijan los goldens, no se reordena): cuenta atrás -> `roundStart` -> `refreshRoster` (versus) -> `time += dt` -> `stepChef` por chef -> `separate` -> `hazardsTick` -> `sabotageTick` -> `settleVip` -> `cookTick` -> `burnTick` -> `midTick` -> `returnDirtyPlates` -> `refillPantry` -> `spawnVip` -> `ordersTick` -> cuenta final -> `finish`.
- **Orden de `stepChef`**: resbalón o puntería (cortan el turno) -> `targetStation` -> borde de B -> `magnetPull` -> `updateChop` -> `dashPress` -> `applyChop` o `walk` -> `pressA`.
- **Determinismo**: sin reloj ni E/S; todo el azar sale de `mulberry32` con semilla (una corriente por equipo, otra para VIP, otra para eventos). En coop el RNG se consume solo al admitir una orden; en versus, en cada hueco. Una ronda sin flags (`hazards`, `burn`, `events`, `recipes`, `magnet`) no toca ninguno de esos caminos.
- Los cálculos de mapas (`maps`, `validate`, `generate`) no dependen de `round/`.

## Red de tests

- `npm run test:agent -- --project game-pizzas`: reglas, mapas, validador, generador (rápidos).
- `npx vitest run --project slow games/pizzas`: goldens `test/golden/{coop,burn,magnet}.golden.slow.test.ts` (fixtures en `test/golden/fixtures/`, no se regraban), espejo de versus (`*.mirror.slow.test.ts`, `versus/versus.slow.test.ts`) y generador.
- Si tocas `round/`, corre ambos. Un golden en rojo significa que cambió el orden o el consumo de RNG: corrige el código, no el fixture.
- Puerta completa: `npm run baseline:check`.
