// "Feel" of the A5 numbers that the design assumed (wind 140 px/s, enemy shove 360 px/s, anchor slide 0.5 tile/s) measured with scripted bots on the real sim: success rate and times.
// usage: npx tsx tools/s1-feel.ts [wind|enemy|anchor]   (no argument = all). The numbers it printed are written down in games/obstaculos/sim/tuning.ts ("A6 feel").
import { anchorTrial, enemyLevel, playBots, windLevel } from '@pichi/game-obstaculos/sim/feelkit';

const which = process.argv[2];
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : NaN;
};

function wind() {
  console.log(
    '\n== WIND: two ObstBots cross a pit (gust 1 s every 3 s, announced 1 s ahead). 12 phases x each setting. cleared = both across within 90 s',
  );
  console.log('gap dir  windPx | cleared  mean s  p90 s | deaths/trial hearts/trial');
  for (const gap of [3, 5])
    for (const dir of [-1, 1] as const)
      for (const px of [0, 100, 140, 180]) {
        const def = windLevel(gap, dir);
        const r = Array.from({ length: 12 }, (_, k) =>
          playBots(def, 'glacier', k * 15, 90, (w) => {
            w.camp!.windPxPerSec = px;
          }),
        );
        const ok = r.filter((x) => x.cleared);
        console.log(
          `${String(gap).padStart(3)} ${String(dir).padStart(3)} ${String(px).padStart(7)} | ${((ok.length / r.length) * 100).toFixed(0).padStart(5)}%  ${mean(
            ok.map((x) => x.sec),
          )
            .toFixed(1)
            .padStart(6)}  ${pct(
            ok.map((x) => x.sec),
            0.9,
          )
            .toFixed(1)
            .padStart(5)} | ${mean(r.map((x) => x.deaths))
            .toFixed(2)
            .padStart(6)} ${mean(r.map((x) => x.heartsLost))
            .toFixed(2)
            .padStart(6)}`,
        );
      }
}

function enemy() {
  console.log(
    '\n== SOFT ENEMIES: two ObstBots cross a floor with two beetles (patrol +-3 tiles, 1.5 tiles/s). 12 phases x each shove speed (PUSH=a,b,c to change). cleared = both in the goal within 90 s',
  );
  console.log('pushPx | cleared  mean s  p90 s | shoves/trial stuns/trial deaths/trial');
  for (const px of process.env.PUSH ? process.env.PUSH.split(',').map(Number) : [240, 330, 360, 390, 420, 480]) {
    const r = Array.from({ length: 12 }, (_, k) =>
      playBots(enemyLevel(), 'forest', k * 17, 90, (w) => {
        w.camp!.enemyPushPxPerSec = px;
      }),
    );
    const ok = r.filter((x) => x.cleared);
    console.log(
      `${String(px).padStart(6)} | ${((ok.length / r.length) * 100).toFixed(0).padStart(5)}%  ${mean(ok.map((x) => x.sec))
        .toFixed(1)
        .padStart(6)}  ${pct(
        ok.map((x) => x.sec),
        0.9,
      )
        .toFixed(1)
        .padStart(5)} | ${mean(r.map((x) => x.shoves))
        .toFixed(1)
        .padStart(9)} ${mean(r.map((x) => x.stuns))
        .toFixed(1)
        .padStart(9)} ${mean(r.map((x) => x.deaths))
        .toFixed(2)
        .padStart(9)}`,
    );
  }
}

function anchor() {
  console.log(
    '\n== ANCHOR SLIDE: slot 0 stands unplanted `dist` tiles from the cliff edge, slot 1 dangles from the rope. Window = seconds until slot 0 goes over the edge with no reaction;',
  );
  console.log(
    'success(react) = share of trials where slot 0 plants (B) `react` s after the rope goes taut and stops before the edge (24 start offsets: the hanger drops at different phases)',
  );
  console.log('slide t/s dist | window s | success(0.5s) (1.0s) (1.5s) (2.0s)');
  for (const slide of [0.25, 0.5, 1, 2])
    for (const dist of [2, 3, 5]) {
      const win = anchorTrial(slide, dist, -1).window;
      const succ = [0.5, 1, 1.5, 2].map(
        (rc) => Array.from({ length: 24 }, (_, k) => anchorTrial(slide, dist, rc, k * 3).stopped).filter(Boolean).length / 24,
      );
      console.log(
        `${String(slide).padStart(10)} ${String(dist).padStart(4)} | ${(Number.isFinite(win) ? win.toFixed(1) : 'never').padStart(8)} | ${succ.map((x) => `${(x * 100).toFixed(0).padStart(5)}%`).join('  ')}`,
      );
    }
}

if (!which || which === 'wind') wind();
if (!which || which === 'enemy') enemy();
if (!which || which === 'anchor') anchor();
