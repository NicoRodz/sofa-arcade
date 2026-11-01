// The oven that burns, drawn (burn.ts is the rules): the "about to burn" bubble over a ready pizza, the flames and the douse bar over a station on fire,
// the red extinguisher in the hands of a chef that is putting it out with a stream of foam, and the reactions to the burn events (smoke, flames, steam).
// Everything is drawn by code. Reads `game.stations` (fire / warned / burnt) and `game.players` (dousing); only exists when `game.burn` does.
import Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../sim/round/events';
import type { Game } from '../../sim/overcooked';
import { DOUSE_MS } from '../../sim/rules/burn';
import { fireNeedMs } from '../../sim/hazards/fire-v2';
import { C, TILE, U, hexNum, R } from '@pichi/screen-kit/art';
import { OX, OY } from './env/grid';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { Bar, place } from './stations';
import { BIG_K, BigFireMark } from './feel/fire-big';

const tilePx = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
// A label over a station goes above it, or below it when the station is on the top wall (the strip of the HUD is right above): `dy` is the distance in tiles.
const labelY = (p: { y: number }, dy: number) => (p.y < OY + TILE * 1.2 ? p.y + TILE * (dy + 0.2) : p.y - TILE * dy);
const EXT_K = 0.95; // size of the extinguisher in the chef's hands
const NOZZLE = { x: 31, y: -26 }; // the nozzle in the texture's design units, relative to its origin

interface FireView {
  flames: Phaser.GameObjects.Image[];
  glow: Phaser.GameObjects.Image;
  bar: Bar;
  hint: Phaser.GameObjects.Text;
  mark: BigFireMark | null; // the big fire's panel (feel/fire-big.ts), made when the kitchen's fire turns out to be big
  flick: number;
  ember: number;
  born: number;
}
interface WarnView {
  g: Phaser.GameObjects.Graphics;
  t: Phaser.GameObjects.Text;
}
interface ExtView {
  img: Phaser.GameObjects.Image;
  spray: number;
}

export class BurnView {
  private fires = new Map<number, FireView>();
  private warns = new Map<number, WarnView>();
  private exts = new Map<number, ExtView>();
  private off: (() => void)[] = [];
  private t = 0;
  private bestChefs = 0; // the most chefs holding Picar in front of any one station (the big fire's panel shows it)
  private hintSeen = false; // the "hold Picar" hint explains itself until somebody has put a fire out (or tried) once in the round

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const at = (i: number) => {
      const s = game.stations[i];
      return s ? tilePx(s.tx, s.ty) : { x: 0, y: 0 };
    };
    on('oven:warn', (e) => {
      const p = at(e.station);
      this.fx.ring(p.x, p.y + TILE * 0.2, 0xffb020, 0.4, 1.7);
      this.fx.float(p.x, labelY(p, 0.78), '¡Se quema!', C.warn, 36);
    });
    on('oven:burnt', (e) => {
      const p = at(e.station);
      this.fx.sootPuff(p.x, p.y, 5);
      this.fx.ring(p.x, p.y + TILE * 0.2, 0xd7263d, 0.4, 1.9);
      this.fx.float(p.x, labelY(p, 0.78), '¡Quemada!', C.danger, 40);
      this.fx.shake(120, 0.003);
    });
    on('oven:rescued', (e) => {
      const p = at(e.station);
      this.fx.starBurst(p.x, p.y - TILE * 0.2, 6);
      this.fx.float(p.x, labelY(p, 0.78), '¡Justo a tiempo!', C.cheese, 36);
    });
    on('fire:start', (e) => {
      const p = at(e.station);
      this.fx.shake(e.big ? 420 : 220, e.big ? 0.011 : 0.006);
      this.fx.ring(p.x, p.y, 0xff8a1f, 0.5, e.big ? 4.4 : 3);
      this.fx.ring(p.x, p.y, 0xffc93c, 0.3, e.big ? 3 : 2);
      this.fx.float(p.x, labelY(p, e.big ? 1.5 : 0.9), e.big ? '¡FUEGO GRANDE!' : '¡FUEGO!', C.fire, e.big ? 72 : 56);
      for (let i = 0; i < 6; i++) this.fx.ember(p.x + (Math.random() - 0.5) * TILE * 0.6, p.y);
    });
    on('fire:spread', (e) => {
      const p = at(e.station);
      this.fx.ring(p.x, p.y, 0xff8a1f, 0.4, 2);
      this.fx.shake(90, 0.003);
      for (let i = 0; i < 4; i++) this.fx.ember(p.x + (Math.random() - 0.5) * TILE * 0.6, p.y);
    });
    on('fire:out', (e) => {
      const p = at(e.station);
      this.fx.steamPuff(p.x, p.y - TILE * 0.1, 9);
      this.fx.ring(p.x, p.y, 0x7fd0f2, 0.4, 2.2);
      this.fx.starBurst(p.x, p.y - TILE * 0.3, 5);
      this.fx.float(p.x, labelY(p, 0.9), '¡Apagado!', '#BFE8F5', 44);
    });
  }

  private chefFeet(id: number) {
    const q = this.game.players.get(id);
    return q ? { x: OX + q.x * TILE, y: OY + (q.y + 0.3) * TILE, q } : null;
  }

  private makeFire(idx: number): FireView {
    const s = this.game.stations[idx]!;
    const p = tilePx(s.tx, s.ty);
    const d = 100 + OY + (s.ty + 1) * TILE + 3;
    const flames = [0, 1, 2, 1, 0].map((n, i) =>
      place(this.scene, `flame_${n}`, p.x + (i - 2) * TILE * 0.17, p.y + TILE * (0.3 - (i % 2) * 0.06), 1).setDepth(
        d + (i === 2 ? 0.2 : i % 2 ? 0.1 : 0),
      ),
    );
    const glow = this.scene.add
      .image(p.x, p.y + TILE * 0.1, 'fx_glow')
      .setScale(((U * 2.3) / R) * 2)
      .setDepth(d - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.5);
    const bar = new Bar(this.scene, 74);
    bar.root.setPosition(p.x, p.y - TILE * 0.62).setDepth(3000);
    if (p.y < OY + TILE * 1.2) bar.root.setPosition(p.x, p.y + TILE * 0.6);
    const hint = makeText(this.scene, p.x, labelY(p, 0.95), 'Mantén PICAR', { size: 26, color: C.cream, stroke: 5, depth: 3001 });
    return { flames, glow, bar, hint, mark: null, flick: 0, ember: 0, born: this.t };
  }

  private updateFire(idx: number, v: FireView, dtMs: number, chefs: number, hinted: boolean) {
    const s = this.game.stations[idx]!;
    const p = tilePx(s.tx, s.ty);
    const b = this.game.burn!;
    const k = s.owner ?? 0;
    const big = !!b.fires[k]?.big; // v2: the kitchen's fire needs two chefs at once (flames 1.5x, panel over the station)
    const sz = big ? BIG_K : 1;
    v.flick -= dtMs;
    if (v.flick <= 0) {
      v.flick = 70;
      const grow = Math.min(1, (this.t - v.born) / 350); // the fire climbs in
      v.flames.forEach((f, i) => {
        const kk = ((1.55 + (i === 2 ? 0.5 : 0)) * U * sz) / R;
        f.setPosition(p.x + (i - 2) * TILE * 0.17 * sz, p.y + TILE * (0.3 - (i % 2) * 0.06))
          .setScale(kk * (0.9 + Math.random() * 0.25) * (0.5 + 0.5 * grow), kk * (0.95 + Math.random() * 0.4) * (0.4 + 0.6 * grow))
          .setAlpha(0.92 + Math.random() * 0.08)
          .setAngle((Math.random() - 0.5) * 8);
      });
    }
    v.glow
      .setScale(((U * 2.3 * sz) / R) * 2)
      .setAlpha(0.42 + Math.sin(this.t / 70) * 0.1)
      .setPosition(p.x, p.y + TILE * 0.1);
    v.ember -= dtMs;
    if (v.ember <= 0) {
      v.ember = big ? 60 : 110;
      this.fx.ember(p.x + (Math.random() - 0.5) * TILE * 0.5 * sz, p.y);
      if (Math.random() < 0.35) this.fx.sootPuff(p.x + (Math.random() - 0.5) * TILE * 0.4, p.y - TILE * 0.2);
    }
    const frac = Math.min(1, (s.fire ?? 0) / (b.v2 ? fireNeedMs(b, k) : DOUSE_MS));
    if (big && hinted && !v.mark) {
      // ONE panel for the whole fire (the station that caught it first); on the top wall there is no room above, so it goes under the counter
      const top = p.y < OY + TILE * 1.2;
      v.mark = new BigFireMark(this.scene, p.x, top ? p.y + TILE * 2.3 : Math.max(p.y - TILE * 1.75, OY + TILE * 0.9), top ? 80 : -80);
    }
    if (v.mark) {
      const mine = this.game.stations.filter((o) => o.fire !== undefined && (o.owner ?? 0) === k);
      const best = Math.max(0, ...mine.map((o) => (o.fire ?? 0) / fireNeedMs(b, k)));
      v.mark.update(dtMs, this.bestChefs, Math.min(1, best));
    }
    v.bar.root.setVisible(!big && frac > 0.001);
    if (!big && frac > 0.001) v.bar.set(frac, '#7FD0F2');
    // the hint: until somebody has held Picar in front of a fire; afterwards it stays quiet
    v.hint
      .setVisible(hinted && !this.hintSeen && !chefs && frac < 0.01 && this.t - v.born > 400 && !big)
      .setAlpha(0.75 + Math.sin(this.t / 140) * 0.25);
  }

  update(dtMs: number) {
    this.t += dtMs;
    const g = this.game;
    // who is putting a fire out
    const dousers = new Map<number, number>(); // station index -> how many chefs
    for (const q of g.players.values()) if (q.dousing && q.chopAt >= 0) dousers.set(q.chopAt, (dousers.get(q.chopAt) ?? 0) + 1);
    if (dousers.size) this.hintSeen = true;
    this.bestChefs = Math.max(0, ...dousers.values());
    // fires
    g.stations.forEach((s, i) => {
      const burning = s.fire !== undefined;
      const v = this.fires.get(i);
      if (burning && !v) this.fires.set(i, this.makeFire(i));
      else if (!burning && v) {
        for (const f of v.flames) f.destroy();
        v.glow.destroy();
        v.bar.root.destroy();
        v.hint.destroy();
        v.mark?.destroy();
        this.fires.delete(i);
      }
    });
    const first = Math.min(...this.fires.keys()); // one hint for the whole fire (the first station that caught it), not one per burning counter
    for (const [i, v] of this.fires) this.updateFire(i, v, dtMs, dousers.get(i) ?? 0, i === first);
    // the "take it out now" bubble over an oven whose pizza is about to burn
    const warnNow = new Set<number>();
    g.stations.forEach((s, i) => {
      if (s.kind === 'pot' && s.warned && !s.burnt && s.done && s.fire === undefined) warnNow.add(i);
    });
    for (const i of warnNow) {
      let w = this.warns.get(i);
      const s = g.stations[i]!,
        p = tilePx(s.tx, s.ty);
      if (!w) {
        w = {
          g: this.scene.add.graphics().setDepth(2900),
          t: makeText(this.scene, p.x, p.y - TILE * 0.62, '!', { size: 40, color: C.cream, stroke: 0, depth: 2901 }),
        };
        this.warns.set(i, w);
      }
      const k = 1 + Math.sin(this.t / 90) * 0.13,
        y = p.y - TILE * 0.62;
      w.g
        .clear()
        .fillStyle(0x2b1b17, 0.35)
        .fillCircle(p.x + 2, y + 3, 24 * k)
        .fillStyle(hexNum(Math.floor(this.t / 140) % 2 ? C.danger : C.warn), 1)
        .fillCircle(p.x, y, 24 * k)
        .lineStyle(4, hexNum(C.ink), 1)
        .strokeCircle(p.x, y, 24 * k);
      w.t.setPosition(p.x, y).setScale(k);
    }
    for (const [i, w] of [...this.warns])
      if (!warnNow.has(i)) {
        w.g.destroy();
        w.t.destroy();
        this.warns.delete(i);
      }
    // extinguishers in the hands of the chefs that are putting a fire out, and the foam
    const live = new Set<number>();
    for (const q of g.players.values()) {
      if (!q.dousing || q.chopAt < 0 || q.ghost) continue;
      const st = g.stations[q.chopAt]!;
      live.add(q.id);
      const f = this.chefFeet(q.id)!;
      let v = this.exts.get(q.id);
      if (!v) {
        v = { img: place(this.scene, 'extinguisher', f.x, f.y, EXT_K).setDepth(100 + f.y + 6), spray: 0 };
        this.exts.set(q.id, v);
      }
      const target = tilePx(st.tx, st.ty);
      const right = target.x >= f.x;
      const hold = { x: f.x + (right ? 1 : -1) * TILE * 0.3, y: f.y - TILE * 0.42 + Math.sin(this.t / 60) * 2 };
      v.img
        .setPosition(hold.x, hold.y)
        .setFlipX(!right)
        .setDepth(100 + f.y + 6);
      v.spray -= dtMs;
      if (v.spray <= 0) {
        v.spray = 50;
        const nx = hold.x + (right ? 1 : -1) * NOZZLE.x * U * EXT_K,
          ny = hold.y + NOZZLE.y * U * EXT_K;
        this.fx.spray(nx, ny, target.x, target.y - TILE * 0.1);
      }
    }
    for (const [id, v] of [...this.exts])
      if (!live.has(id)) {
        v.img.destroy();
        this.exts.delete(id);
      }
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    for (const v of this.fires.values()) {
      for (const f of v.flames) f.destroy();
      v.glow.destroy();
      v.bar.root.destroy();
      v.hint.destroy();
      v.mark?.destroy();
    }
    for (const w of this.warns.values()) {
      w.g.destroy();
      w.t.destroy();
    }
    for (const e of this.exts.values()) e.img.destroy();
    this.fires.clear();
    this.warns.clear();
    this.exts.clear();
  }
}
