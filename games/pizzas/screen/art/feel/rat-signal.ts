// The gentle rat announces itself (feel/rat.ts): a bouncing arrow over the rat, a dashed line to the counter it goes for (an arrow and a pulsing ring over that counter), an alarm
// flash when it is about to arrive, and the prize when it is scared off. Exists only in a round with the magnet and the events on. A versus round has one rat per kitchen
// (feel/rats.ts) and each one gets its own arrow, line and alarm.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import { C, TILE, hexNum } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';
import type { Fx } from '@pichi/screen-kit/art/fx';
import type { Rat } from '../../../sim/rules/midround';
import { ratOfTeam, ratsOf } from './rats';

export class RatSignal {
  private g: Phaser.GameObjects.Graphics;
  private off: (() => void)[] = [];
  private target = new Map<number, number>(); // team -> the counter its rat is going for
  private alarm = new Map<number, number>(); // team -> ms left of the "about to arrive" flash
  private t = 0;
  constructor(
    scene: Phaser.Scene,
    private game: Game,
    fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.g = scene.add.graphics().setDepth(2100);
    const stationPx = (i: number) => {
      const s = game.stations[i];
      return s ? { x: OX + (s.tx + 0.5) * TILE, y: OY + (s.ty + 0.5) * TILE } : null;
    };
    this.off.push(
      bus.on('rat:target', (e) => {
        this.target.set(e.team ?? 0, e.station);
        this.alarm.set(e.team ?? 0, 0);
      }),
    );
    this.off.push(
      bus.on('rat:near', (e) => {
        this.alarm.set(e.team ?? 0, 900);
        const p = stationPx(e.station);
        if (p) fx.ring(p.x, p.y, 0xd7263d, 0.35, 1.6);
      }),
    );
    for (const k of ['rat:steal', 'rat:scared', 'rat:gone'] as const)
      this.off.push(
        bus.on(k, (e) => {
          this.target.set((e as { team?: number }).team ?? 0, -1);
          this.alarm.set((e as { team?: number }).team ?? 0, 0);
        }),
      );
    this.off.push(
      bus.on('rat:scared', (e) => {
        if (!e.bonus) return;
        const r = ratOfTeam(game, e.team ?? 0);
        if (r) fx.float(OX + r.x * TILE, OY + r.y * TILE - TILE * 1.4, `+${e.bonus}`, C.cheese, 46);
      }),
    );
  }

  private arrow(x: number, y: number, size: number, alpha: number, up = false) {
    // a down-pointing arrow whose tip is at (x, y); `up` mirrors it (tip at (x, y), body below)
    const g = this.g;
    if (up) {
      g.fillStyle(0x2b1b17, alpha).fillTriangle(x - size - 4, y + size + 8, x + size + 4, y + size + 8, x, y - 6);
      g.fillStyle(hexNum(C.danger), alpha).fillTriangle(x - size, y + size + 4, x + size, y + size + 4, x, y);
      return;
    }
    g.fillStyle(0x2b1b17, alpha).fillTriangle(x - size - 4, y - size - 8, x + size + 4, y - size - 8, x, y + 6);
    g.fillStyle(hexNum(C.danger), alpha).fillTriangle(x - size, y - size - 4, x + size, y - size - 4, x, y);
  }

  update(dtMs: number) {
    const { g, game } = this;
    this.t += dtMs;
    for (const [team, ms] of this.alarm) this.alarm.set(team, Math.max(0, ms - dtMs));
    g.clear();
    if (!game.magnet || game.over) return;
    const bounce = Math.abs(Math.sin(this.t / 220)) * 10;
    for (const [team, r] of ratsOf(game)) if (!r.scared) this.draw(team, r, bounce);
  }

  private draw(team: number, r: Rat, bounce: number) {
    const { g, game } = this;
    const rx = OX + r.x * TILE,
      ry = OY + r.y * TILE;
    // over the rat; when a chef stands right above it the arrow would cover that chef's name tag, so it points up from below instead
    const covers = [...game.players.values()].some(
      (p) => !p.ghost && Math.abs(OX + p.x * TILE - rx) < TILE * 0.6 && OY + p.y * TILE < ry && OY + p.y * TILE > ry - TILE * 1.45,
    );
    if (covers) this.arrow(rx, ry + TILE * 0.5 + bounce, 15, 0.95, true);
    else this.arrow(rx, ry - TILE * 0.62 - bounce, 15, 0.95);
    const target = this.target.get(team) ?? -1;
    const s = target >= 0 && r.state === 'seek' ? game.stations[target] : null;
    if (!s?.item) return;
    const tx = OX + (s.tx + 0.5) * TILE,
      ty = OY + (s.ty + 0.5) * TILE;
    const dist = Math.hypot(tx - rx, ty - ry),
      n = Math.max(1, Math.floor(dist / 22));
    g.lineStyle(5, hexNum(C.danger), 0.7);
    for (let i = 0; i < n; i += 2) {
      // dashed line, marching towards the counter
      const a = (i + ((this.t / 90) % 2)) / n,
        b = Math.min(1, a + 0.5 / n);
      g.beginPath()
        .moveTo(rx + (tx - rx) * a, ry + (ty - ry) * a)
        .lineTo(rx + (tx - rx) * b, ry + (ty - ry) * b)
        .strokePath();
    }
    const flash = (this.alarm.get(team) ?? 0) > 0 ? 0.5 + 0.5 * Math.sin(this.t / 55) : 0.55 + 0.25 * Math.sin(this.t / 160);
    g.lineStyle(8, hexNum(C.danger), flash).strokeRoundedRect(OX + s.tx * TILE + 3, OY + s.ty * TILE + 3, TILE - 6, TILE - 6, 14);
    this.arrow(tx, ty - TILE * 0.5 - bounce, 13, 0.9); // over the counter it wants
  }
  destroy() {
    for (const f of this.off) f();
    this.off = [];
    this.g.destroy();
  }
}
