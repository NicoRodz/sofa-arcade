# Slowest tests (baseline)

Measured with files running in parallel on a shared machine (load average 8.0, 10 cores): treat as order of magnitude, not as a benchmark.

## 10 slowest files (wall time of the file)

| ms | file |
|---:|---|
| 203327 | shared/games/obstaculos/generate/generate.test.ts |
| 145107 | controller/test/layout.test.ts |
| 41222 | shared/generate.test.ts |
| 29757 | shared/generate.versus.test.ts |
| 20217 | shared/games/obstaculos/campaign/learning.test.ts |
| 15521 | shared/games/obstaculos/levels/levels.test.ts |
| 10130 | server/test/sabotage.ws.test.ts |
| 9466 | server/test/versus.ws.test.ts |
| 6625 | shared/events.mirror.test.ts |
| 4203 | shared/versus.test.ts |

## 10 slowest tests

| ms | file | test |
|---:|---|---|
| 108841 | shared/games/obstaculos/generate/generate.test.ts | generateLevel: 500 consecutive seeds, every one valid 500 seeds (difficulty, players and m |
| 98968 | controller/test/layout.test.ts | phone layout has no overlaps, clipped text, small touch targets or safe-area violations in |
| 51919 | shared/games/obstaculos/generate/generate.test.ts | generateLevel: 500 consecutive seeds, every one valid the full matrix: 3 difficulties x n  |
| 26612 | shared/generate.versus.test.ts | generateVersus 500 seeds in a row per difficulty and player count: always valid and always |
| 17945 | shared/generate.test.ts | generate 500 seeds per difficulty: all valid, at least 90% inside the band (2 players) |
| 13057 | shared/games/obstaculos/generate/generate.test.ts | generateLevel: determinism and structure cooperative modules respect n: with 2 players no  |
| 10920 | controller/test/layout.test.ts | phone layout the Captain's D-pad shows its 7 buttons on every screen but the round, and on |
| 10809 | shared/games/obstaculos/generate/generate.test.ts | generateLevel: determinism and structure the validator is in the loop: over 60 seeds some  |
| 8230 | shared/games/obstaculos/generate/generate.test.ts | generateLevel: determinism and structure the harder the difficulty, the higher D on averag |
| 8007 | shared/generate.test.ts | generate also valid with 4, 6 and 8 players, with the station counts of the design table |
