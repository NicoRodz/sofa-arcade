# Slowest tests (baseline)

Measured with files running in parallel on a shared machine (load average 2.8, 10 cores): treat as order of magnitude, not as a benchmark.

## 10 slowest files (wall time of the file)

| ms | file |
|---:|---|
| 288529 | apps/controller/test/layout.slow.test.ts |
| 187214 | games/obstaculos/generate/generate.slow.test.ts |
| 72032 | apps/controller/test/menu-layout.slow.test.ts |
| 61842 | games/pizzas/test/mech/kneader/bot.slow.test.ts |
| 48132 | games/pizzas/test/mech/gen/play.slow.test.ts |
| 35528 | games/pizzas/sim/generate.slow.test.ts |
| 24554 | games/pizzas/test/mech/gate/bot.slow.test.ts |
| 22778 | games/pizzas/test/mech/beltReverse/bot.slow.test.ts |
| 20884 | games/pizzas/sim/generate.versus.slow.test.ts |
| 19422 | games/pizzas/test/mech/ovenHeat/bot.slow.test.ts |

## 10 slowest tests

| ms | file | test |
|---:|---|---|
| 131026 | apps/controller/test/layout.slow.test.ts | phone layout landscape: no overlaps, clipped text, small touch targets, covered buttons or |
| 103562 | apps/controller/test/layout.slow.test.ts | phone layout portrait: no overlaps, clipped text, small touch targets, covered buttons or  |
| 100655 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid 500 seeds (difficulty, players and m |
| 48304 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid the full matrix: 3 difficulties x n  |
| 25771 | apps/controller/test/menu-layout.slow.test.ts | Captain menu layout landscape: every state is tappable (>= 44px), without overlaps, sidewa |
| 19628 | apps/controller/test/menu-layout.slow.test.ts | Captain menu layout portrait: every state is tappable (>= 44px), without overlaps, sideway |
| 19217 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the woodOven map N=8: 20 seeds, no blocks |
| 18981 | games/pizzas/sim/generate.versus.slow.test.ts | generateVersus 500 seeds in a row per difficulty and player count: always valid and always |
| 15793 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the kneader map N=8: 20 seeds, no blocks |
| 14483 | games/pizzas/sim/generate.slow.test.ts | generate 500 seeds per difficulty: all valid, at least 90% inside the band (2 players) |
