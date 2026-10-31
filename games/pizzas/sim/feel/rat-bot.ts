// A human with a phone chases the rat of the mid-round event (feel pass: "the rat never gives you a chance to reach it"). Same imperfections as feel/human-bot.ts
// (noisy stick, 60-150 ms of latency, a dash aimed within +-40 degrees) on the sim's public controls. Test and tooling support: nothing in the game imports this.
// One event per game: the rat is forced to appear at 3 s with two counters holding something for it to go for. `window` = from its first step to the moment it is gone.
import { mulberry32, type Rng } from '@pichi/core/rng';
import { HUMAN, type Ctl, type Sim } from './human-bot';
import { hazardParams } from '../hazards/hazard-v2';

export interface RatRun {
  caught: boolean;
  caughtMs: number;
  windowMs: number;
  stolen: boolean;
  stealMs: number;
  lostItem: boolean;
  seed: number;
  map: string;
  carry: boolean;
}
const rot = (x: number, y: number, deg: number): [number, number] => {
  const t = (deg * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  return [x * c - y * s, x * s + y * c];
};
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// BFS distance (in tiles) from the rat's tile over floor tiles.
function field(sim: Sim, g: any, tx: number, ty: number): Map<string, number> {
  const d = new Map<string, number>([[`${tx},${ty}`, 0]]),
    q: [number, number][] = [[tx, ty]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx,
        ny = y + dy,
        k = `${nx},${ny}`;
      if (sim.isFloor(g.grid, nx, ny) && !d.has(k)) {
        d.set(k, d.get(`${x},${y}`)! + 1);
        q.push([nx, ny]);
      }
    }
  }
  return d;
}
const clearLine = (sim: Sim, g: any, ax: number, ay: number, bx: number, by: number) => {
  for (let t = 0; t <= 1; t += 0.1) if (!sim.isFloor(g.grid, Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  return true;
};

export async function runRat(sim: Sim, mapIdx: number, seed: number, gameOpts: Record<string, unknown> = {}): Promise<RatRun | null> {
  const map = sim.maps[mapIdx]!,
    r = mulberry32(seed * 104729 + mapIdx);
  const g = sim.createGame({ mapId: map.id, rows: map.rows, spawns: map.spawns, n: 2, seed, countdownMs: 0, events: true, ...gameOpts });
  const counters = g.stations.filter((s: any) => s.kind === 'counter');
  if (counters.length < 3 || !g.mid) return null;
  for (let i = 0; i < 2; i++) counters.splice(Math.floor(r() * counters.length), 1)[0].item = 'raw1';
  Object.assign(g.mid, { kind: 'rat', startAt: 3000, announceAt: 0, endAt: Infinity, phase: 'wait', dark: false, rat: null });
  sim.addPlayer(g, 1, 0, 0);
  sim.addPlayer(g, 2, 1, 1);
  const floor: [number, number][] = [];
  g.grid.forEach((row: any[], y: number) =>
    row.forEach((_t, x) => {
      if (sim.isFloor(g.grid, x, y)) floor.push([x, y]);
    }),
  );
  const [sx, sy] = floor[Math.floor(r() * floor.length)]!;
  const carry = r() < 0.5; // half the time the chef has its hands full (a dash needs them free)
  if (carry) g.players.get(1).item = 'raw0';
  Object.assign(g.players.get(1), { x: sx + 0.5 + (r() - 0.5) * 0.28, y: sy + 0.5 + (r() - 0.5) * 0.28 });
  const out: RatRun = {
    caught: false,
    caughtMs: 0,
    windowMs: 0,
    stolen: false,
    stealMs: Infinity,
    lostItem: false,
    seed,
    map: map.id,
    carry,
  };
  let appeared = -1,
    gone = -1;
  g.bus.on('rat:appear', () => {
    appeared = g.time;
  });
  g.bus.on('rat:scared', () => {
    out.caught = true;
    out.caughtMs = g.time - appeared;
  });
  g.bus.on('rat:steal', () => {
    out.stolen = true;
    out.stealMs = Math.min(out.stealMs, g.time - appeared);
  });
  g.bus.on('rat:gone', () => {
    gone = g.time;
  });
  let lastDodge = -1e9; // HAZARD_V2: a dash into a rat that has just dodged is wasted; the chef keeps running at it and dashes again when the rat pants or its dodge is back
  g.bus.on('rat:dodge', () => {
    lastDodge = g.time;
  });
  // the human
  const lat = Math.round((HUMAN.latMs[0] + (HUMAN.latMs[1] - HUMAN.latMs[0]) * r()) / (1000 / 60));
  const queue: Ctl[] = Array.from({ length: lat }, () => ({ x: 0, y: 0, a: 0, b: false }));
  const mag = HUMAN.magMin + (HUMAN.magMax - HUMAN.magMin) * r(),
    trig = 1.5 + 1.1 * r();
  const notice = 500 + 1000 * r(); // ms between the rat showing up and the chef noticing it
  let noise = 0,
    lastPress = -1e9,
    bTicks = 0;
  const rho = Math.exp(-1 / 60 / HUMAN.noiseTauS);
  const frame = 1000 / 60;
  for (let t = 0; t < 45_000 / frame && gone < 0; t++) {
    const now = g.time,
      rat = g.mid.rat,
      p = g.players.get(1);
    let c: Ctl = { x: 0, y: 0, a: 0, b: false };
    if (rat && !out.caught && !rat.scared && now - appeared >= notice) {
      const dx = rat.x - p.x,
        dy = rat.y - p.y,
        d = Math.hypot(dx, dy) || 1;
      let ux = dx / d,
        uy = dy / d;
      if (d > 2.2 || !clearLine(sim, g, p.x, p.y, rat.x, rat.y)) {
        // far or behind a wall: walk the tiles
        const f = field(sim, g, Math.floor(rat.x), Math.floor(rat.y)),
          tx = Math.floor(p.x),
          ty = Math.floor(p.y);
        let best: [number, number] = [tx, ty],
          bd = f.get(`${tx},${ty}`) ?? 1e9;
        for (const [ax, ay] of DIRS4) {
          const v = f.get(`${tx + ax},${ty + ay}`);
          if (v !== undefined && v < bd) {
            bd = v;
            best = [tx + ax, ty + ay];
          }
        }
        const bx = best[0] + 0.5 - p.x,
          by = best[1] + 0.5 - p.y,
          bl = Math.hypot(bx, by) || 1;
        if (best[0] !== tx || best[1] !== ty) {
          ux = bx / bl;
          uy = by / bl;
        }
      }
      noise = noise * rho + HUMAN.noiseDeg * Math.sqrt(1 - rho * rho) * gauss(r);
      const [x, y] = rot(ux, uy, noise);
      c = { x: x * mag, y: y * mag, a: 0, b: false };
      const dodgeBack = now - lastDodge > (g.hz ? hazardParams(g.difficulty, 2).rat.dodgeCdMs : 0);
      if (d < trig && now - lastPress > 700 && !p.item && (dodgeBack || (rat.pantMs ?? 0) > 0)) {
        lastPress = now;
        bTicks = 2;
      }
    }
    if (bTicks > 0) {
      c.b = true;
      bTicks--;
    }
    queue.push(c);
    const delayed = queue.shift()!;
    await sim.tick(
      g,
      new Map([
        [1, delayed],
        [2, { x: 0, y: 0, a: 0, b: false }],
      ]),
    );
    if (out.caught && gone < 0 && !g.mid.rat) break;
  }
  out.windowMs = (gone >= 0 ? gone : g.time) - Math.max(0, appeared);
  out.lostItem = out.stolen && !out.caught;
  return appeared < 0 ? null : out;
}
