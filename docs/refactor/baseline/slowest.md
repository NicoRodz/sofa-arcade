# Slowest tests (baseline)

Measured with files running in parallel on a shared machine (load average 5.5, 10 cores): treat as order of magnitude, not as a benchmark.

## 10 slowest files (wall time of the file)

| ms | file |
|---:|---|
| 235107 | controller/test/layout.slow.test.ts |
| 167150 | shared/games/obstaculos/generate/generate.slow.test.ts |
| 28178 | shared/generate.slow.test.ts |
| 20633 | shared/generate.versus.slow.test.ts |
| 16567 | shared/games/obstaculos/campaign/learning.slow.test.ts |
| 14440 | shared/games/obstaculos/levels/levels.slow.test.ts |
| 9658 | shared/recipes.mirror.test.ts |
| 9502 | server/test/sabotage.ws.slow.test.ts |
| 8276 | server/test/versus.ws.slow.test.ts |
| 6405 | shared/magnet.mirror.slow.test.ts |

## 10 slowest tests

| ms | file | test |
|---:|---|---|
| 104400 | controller/test/layout.slow.test.ts | phone layout landscape: no overlaps, clipped text, small touch targets, covered buttons or |
| 83095 | controller/test/layout.slow.test.ts | phone layout portrait: no overlaps, clipped text, small touch targets, covered buttons or  |
| 81931 | shared/games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid 500 seeds (difficulty, players and m |
| 47931 | shared/games/obstaculos/generate/generate.slow.test.ts | generateLevel: 500 consecutive seeds, every one valid the full matrix: 3 difficulties x n  |
| 19265 | shared/generate.versus.slow.test.ts | generateVersus 500 seeds in a row per difficulty and player count: always valid and always |
| 15059 | shared/generate.slow.test.ts | generate 500 seeds per difficulty: all valid, at least 90% inside the band (2 players) |
| 12096 | shared/games/obstaculos/generate/generate.slow.test.ts | generateLevel: determinism and structure cooperative modules respect n: with 2 players no  |
| 11255 | controller/test/layout.slow.test.ts | phone layout the Captain's D-pad shows its 7 buttons on every screen but the round, and on |
| 7901 | shared/games/obstaculos/generate/generate.slow.test.ts | generateLevel: determinism and structure the validator is in the loop: over 60 seeds some  |
| 7618 | shared/games/obstaculos/generate/generate.slow.test.ts | generateLevel: determinism and structure the harder the difficulty, the higher D on averag |
