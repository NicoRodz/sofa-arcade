// The gentle rat announces itself (feel/rat.ts): a bouncing arrow over the rat, a dashed line to the counter it goes for (an arrow and a pulsing ring over that counter), an alarm
// flash when it is about to arrive, and the prize when it is scared off. Exists only in a round with the magnet and the events on.
import type Phaser from 'phaser';
import type { Emitter, GameEvents } from '@party/shared/events';
import type { Game } from '@party/shared/game';
import { C, OX, OY, TILE, hexNum } from '../tokens';
import type { Fx } from '../fx';

export class RatSignal {
  private g: Phaser.GameObjects.Graphics;
  private off: (() => void)[] = [];
  private target = -1;
  private alarm = 0; // ms left of the "about to arrive" flash
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
        this.target = e.station;
        this.alarm = 0;
      }),
    );
    this.off.push(
      bus.on('rat:near', (e) => {
        this.alarm = 900;
        const p = stationPx(e.station);
        if (p) fx.ring(p.x, p.y, 0xd7263d, 0.35, 1.6);
      }),
    );
    for (const k of ['rat:steal', 'rat:scared', 'rat:gone'] as const)
      this.off.push(
        bus.on(k, () => {
          this.target = -1;
          this.alarm = 0;
        }),
      );
    this.off.push(
      bus.on('rat:scared', (e) => {
        if (!e.bonus) return;
        const r = game.mid?.rat;
        if (r) fx.float(OX + r.x * TILE, OY + r.y * TILE - TILE * 1.4, `+${e.bonus}`, C.cheese, 46);
      }),
    );
  }

  private arrow(x: number, y: number, size: number, alpha: number) {
    // a down-pointing arrow whose tip is at (x, y)
    const g = this.g;
    g.fillStyle(0x2b1b17, alpha).fillTriangle(x - size - 4, y - size - 8, x + size + 4, y - size - 8, x, y + 6);
    g.fillStyle(hexNum(C.danger), alpha).fillTriangle(x - size, y - size - 4, x + size, y - size - 4, x, y);
  }

  update(dtMs: number) {
    const { g, game } = this;
    this.t += dtMs;
    this.alarm = Math.max(0, this.alarm - dtMs);
    g.clear();
    const r = game.mid?.rat;
    if (!game.magnet || !r || r.scared || game.over) return;
    const bounce = Math.abs(Math.sin(this.t / 220)) * 10;
    const rx = OX + r.x * TILE,
      ry = OY + r.y * TILE;
    this.arrow(rx, ry - TILE * 0.62 - bounce, 15, 0.95); // over the rat
    const s = this.target >= 0 && r.state === 'seek' ? game.stations[this.target] : null;
    if (!s || !s.item) return;
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
    const flash = this.alarm > 0 ? 0.5 + 0.5 * Math.sin(this.t / 55) : 0.55 + 0.25 * Math.sin(this.t / 160);
    g.lineStyle(8, hexNum(C.danger), flash).strokeRoundedRect(OX + s.tx * TILE + 3, OY + s.ty * TILE + 3, TILE - 6, TILE - 6, 14);
    this.arrow(tx, ty - TILE * 0.5 - bounce, 13, 0.9); // over the counter it wants
  }
  destroy() {
    for (const f of this.off) f();
    this.off = [];
    this.g.destroy();
  }
}
