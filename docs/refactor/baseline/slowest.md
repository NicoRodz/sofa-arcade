# Slowest tests (baseline)

Measured with files running in parallel on a shared machine (load average 4.0, 10 cores): treat as order of magnitude, not as a benchmark.

## 10 slowest files (wall time of the file)

| ms | file |
|---:|---|
| 318403 | apps/controller/test/layout.slow.test.ts |
| 202011 | games/obstaculos/generate/generate.slow.test.ts |
| 83633 | apps/controller/test/menu-layout.slow.test.ts |
| 70738 | games/pizzas/test/mech/kneader/bot.slow.test.ts |
| 50542 | games/pizzas/test/mech/gen/play.slow.test.ts |
| 37799 | games/pizzas/sim/generate.slow.test.ts |
| 26733 | games/pizzas/test/mech/gate/bot.slow.test.ts |
| 24895 | games/pizzas/test/mech/beltReverse/bot.slow.test.ts |
| 23239 | games/pizzas/sim/generate.versus.slow.test.ts |
| 21571 | games/pizzas/test/mech/ovenHeat/bot.slow.test.ts |

## 10 slowest tests

| ms | file | test |
|---:|---|---|
| 133181 | apps/controller/test/layout.slow.test.ts | phone layout landscape: no overlaps, clipped text, small touch targets, covered buttons or |
| 113908 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid 500 seeds (difficulty, players and m |
| 102959 | apps/controller/test/layout.slow.test.ts | phone layout portrait: no overlaps, clipped text, small touch targets, covered buttons or  |
| 49119 | games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid the full matrix: 3 difficulties x n  |
| 30187 | apps/controller/test/menu-layout.slow.test.ts | Captain menu layout landscape: every state is tappable (>= 44px), without overlaps, sidewa |
| 23543 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the woodOven map N=8: 20 seeds, no blocks |
| 23139 | apps/controller/test/layout.slow.test.ts | phone layout event notes (#evnote): over the landscape pad it lets every touch through to  |
| 23030 | apps/controller/test/menu-layout.slow.test.ts | Captain menu layout portrait: every state is tappable (>= 44px), without overlaps, sideway |
| 21041 | games/pizzas/sim/generate.versus.slow.test.ts | generateVersus 500 seeds in a row per difficulty and player count: always valid and always |
| 17266 | games/pizzas/test/mech/kneader/bot.slow.test.ts | bot on the kneader map N=8: 20 seeds, no blocks |
