# Slowest tests (baseline)

Measured with files running in parallel on a shared machine (load average 14.1, 10 cores): treat as order of magnitude, not as a benchmark.

## 10 slowest files (wall time of the file)

| ms | file |
|---:|---|
| 123892 | apps/controller/test/layout.slow.test.ts |
| 99300 | games/pizzas/test/mech/kneader/bot.slow.test.ts |
| 86213 | games/obstaculos/generate/generate.slow.test.ts |
| 67538 | games/pizzas/sim/generate.slow.test.ts |
| 48085 | games/pizzas/test/mech/gen/play.slow.test.ts |
| 42386 | apps/controller/test/menu-layout.slow.test.ts |
| 19098 | games/pizzas/test/mech/beltReverse/bot.slow.test.ts |
| 18585 | games/pizzas/test/mech/gate/bot.slow.test.ts |
| 16526 | games/pizzas/test/mech/ovenHeat/bot.slow.test.ts |
| 16490 | games/pizzas/sim/generate.versus.slow.test.ts |

## 10 slowest tests

| ms | file | test |
|---:|---|---|
| 93384 | apps/controller/test/layout.slow.test.ts | phone layout landscape: no overlaps, clipped text, small touch targets, covered buttons or |
| 70779 | apps/controller/test/layout.slow.test.ts | phone layout portrait: no overlaps, clipped text, small touch targets, covered buttons or  |
| 34926 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the kneader map N=8: 20 seeds, no blocks |
| 29295 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid 500 seeds (difficulty, players and m |
| 26308 | games/pizzas/sim/generate.slow.test.ts | generate 500 seeds per difficulty: all valid, at least 90% inside the band (2 players) |
| 26144 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid the full matrix: 3 difficulties x n  |
| 17033 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the woodOven map N=8: 20 seeds, no blocks |
| 15785 | apps/controller/test/menu-layout.slow.test.ts | Captain menu layout landscape: every state is tappable (>= 44px), without overlaps, sidewa |
| 15230 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the woodOven map N=4: 20 seeds, no blocks |
| 15053 | games/pizzas/sim/generate.versus.slow.test.ts | generateVersus 500 seeds in a row per difficulty and player count: always valid and always |
