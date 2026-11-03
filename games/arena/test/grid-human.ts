// Test-only "human": walks the F0 circuit like a player with a thumb, not like the perfect RouteBot. It asks for turns early or late (-6..+24 units
// around the junction), and its stick has angle noise (AR(1), up to ~30 deg), magnitude noise and short dips into the dead zone. Same seed, same run.
// Metric: ticks where the human wants to move (it has a target direction) and the body did not advance, and the turns the sim reports as failed.
import { mulberry32 } from '@pichi/core';
import { CIRCUIT, MAP_W, f0Map, solidAt } from '../map';
import { DOWN, LEFT, NONE, RIGHT, UP, createGrid, stepGrid, turnReport, type ControlPlan, type Dir, type GridBody, type GridInput } from '../sim';
import { distanceField } from './route-bot';

const DIRS: readonly (readonly [Dir, number, number])[] = [
  [RIGHT, 1, 0],
  [DOWN, 0, 1],
  [LEFT, -1, 0],
  [UP, 0, -1],
];

export interface HumanStyle {
  earlyP: number; // chance that a junction is asked for early: 14-19 units ahead (220-300 ms) (a thumb that anticipates) instead of -6..+8 around the centre
  angleDeg: number; // amplitude of the angle noise
  dipP: number; // chance per tick of a dip into the dead zone (1-3 ticks)
}
export const THUMB: HumanStyle = { earlyP: 0.5, angleDeg: 30, dipP: 0.02 };

export class Human {
  next = 0;
  private fields = CIRCUIT.map(([x, y]) => distanceField(x, y));
  private rnd: () => number;
  private lead = 0; // units before the junction centre at which it presses (negative: after passing it)
  private junction = -1;
  private pressed = false; // once it has pressed a junction's turn it holds it (a thumb does not dither with the body's slide)
  private eta = 0; // angle noise, degrees
  private dip = 0;
  private still = 0; // ticks wanting to move without moving
  private panic = 0; // the thumb gives up after 0.75 s: lets go 12 ticks, then pushes back along the old heading 14 ticks
  private last: Dir = RIGHT;
  /** Direction the human is trying for this tick (NONE when it is done). */
  target: Dir = NONE;

  constructor(
    seed: number,
    private style: HumanStyle = THUMB,
  ) {
    this.rnd = mulberry32(seed);
  }
  get done(): boolean {
    return this.next >= CIRCUIT.length;
  }

  private route(tx: number, ty: number, heading: Dir): Dir {
    const d = this.fields[this.next]!;
    const here = d[ty * MAP_W + tx]!;
    let pick: Dir = NONE;
    for (const [dir, dx, dy] of DIRS) {
      const nx = tx + dx,
        ny = ty + dy;
      if (solidAt(f0Map(), nx, ny) || d[ny * MAP_W + nx] !== here - 1) continue;
      if (pick === NONE || dir === heading) pick = dir; // keeps the heading when several routes tie
    }
    return pick;
  }

  private newLead(early: boolean): void {
    this.lead = early ? 14 + Math.floor(this.rnd() * 6) : -6 + Math.floor(this.rnd() * 15);
  }

  /** The direction the human presses: the route's, but a turn off the heading is pressed only from `lead` units before the junction centre. */
  private decide(b: GridBody, tx: number, ty: number): Dir {
    const own = this.route(tx, ty, b.dir);
    if (b.dir === NONE) return own;
    const [, hx, hy] = DIRS[b.dir]!;
    if (own !== b.dir) {
      // the own tile is the junction: a late press waits until `-lead` units past its centre
      if (tx + ty * MAP_W !== this.junction) {
        this.junction = tx + ty * MAP_W;
        this.pressed = false;
        this.newLead(false);
      }
      const dist = (tx * 16 + 8 - b.x) * hx + (ty * 16 + 8 - b.y) * hy;
      if (dist <= this.lead || !b.moved) this.pressed = true; // against a wall nobody waits
      return this.pressed ? own : b.dir;
    }
    for (let k = 1; k <= 3; k++) {
      const jx = tx + hx * k,
        jy = ty + hy * k;
      if (solidAt(f0Map(), jx, jy)) break;
      const d = this.route(jx, jy, b.dir);
      if (d === b.dir) continue;
      if (d === NONE) break;
      if (jx + jy * MAP_W !== this.junction) {
        this.junction = jx + jy * MAP_W;
        this.pressed = false;
        // it anticipates only when no lane toward `d` sits in the tiles before the junction (it would be taken by mistake)
        let laneBefore = false;
        for (let j = 0; j < k; j++) laneBefore ||= !solidAt(f0Map(), tx + hx * j + DIRS[d]![1], ty + hy * j + DIRS[d]![2]);
        this.newLead(!laneBefore && this.rnd() < this.style.earlyP);
      }
      const dist = (jx * 16 + 8 - b.x) * hx + (jy * 16 + 8 - b.y) * hy;
      if (dist <= this.lead || !b.moved) this.pressed = true; // against a wall nobody waits
      return this.pressed ? d : b.dir;
    }
    return own;
  }

  input(b: GridBody): GridInput {
    const tx = Math.floor(b.x / 16),
      ty = Math.floor(b.y / 16);
    while (!this.done && CIRCUIT[this.next]![0] === tx && CIRCUIT[this.next]![1] === ty) this.next++;
    if (this.done) return (this.target = NONE), { sx: 0, sy: 0 };
    this.target = this.decide(b, tx, ty);
    if (this.target === NONE) return { sx: 0, sy: 0 };
    if (b.dir !== NONE) this.last = b.dir;
    this.still = b.moved ? 0 : this.still + 1;
    if (this.still >= 45 && this.panic === 0) this.panic = 26;
    if (this.panic > 0) {
      this.still = 0;
      const press = --this.panic < 14;
      const [, px, py] = DIRS[(this.last + 2) % 4]!;
      return press ? { sx: px * 1000, sy: py * 1000 } : { sx: 0, sy: 0 };
    }
    const [, dx, dy] = DIRS[this.target]!;
    this.eta = this.eta * 0.85 + (this.rnd() * 2 - 1) * this.style.angleDeg * 0.33;
    const a = Math.atan2(dy, dx) + (this.eta * Math.PI) / 180;
    if (this.dip > 0) this.dip--;
    else if (this.rnd() < this.style.dipP) this.dip = 1 + Math.floor(this.rnd() * 3);
    const mag = this.dip > 0 ? 150 : 700 + Math.floor(this.rnd() * 300);
    return { sx: Math.round(Math.cos(a) * mag), sy: Math.round(Math.sin(a) * mag) };
  }
}

export interface HumanRun {
  ticks: number;
  done: boolean;
  wanting: number; // ticks with a target
  stopped: number; // of them, ticks the body did not advance
  requested: number;
  failed: number;
}

export function humanRun(plan: ControlPlan, seed: number, style: HumanStyle = THUMB, cap = 6000): HumanRun {
  const s = createGrid({ slots: [0], control: plan, durationTicks: 1_000_000 });
  const h = new Human(seed, style);
  const b = s.bodies[0]!;
  const r: HumanRun = { ticks: 0, done: false, wanting: 0, stopped: 0, requested: 0, failed: 0 };
  while (!h.done && r.ticks < cap) {
    const inp = h.input(b);
    stepGrid(s, new Map([[0, inp]]));
    r.ticks++;
    if (h.target !== NONE) {
      r.wanting++;
      if (!b.moved) r.stopped++;
    }
  }
  r.done = h.done;
  const t = turnReport(s);
  r.requested = t.requested;
  r.failed = t.failed;
  return r;
}

export function humanTotals(plan: ControlPlan, seeds: number, style: HumanStyle = THUMB) {
  const tot = { runs: seeds, finished: 0, ticks: 0, wanting: 0, stopped: 0, requested: 0, failed: 0 };
  for (let i = 0; i < seeds; i++) {
    const r = humanRun(plan, 1000 + i * 131, style);
    tot.finished += r.done ? 1 : 0;
    tot.ticks += r.ticks;
    tot.wanting += r.wanting;
    tot.stopped += r.stopped;
    tot.requested += r.requested;
    tot.failed += r.failed;
  }
  return tot;
}
