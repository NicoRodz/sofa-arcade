// Sabotage on screen: the reticle and the dotted flight line while a chef aims, the shadow that warns where the bag lands and the bag in the air,
// the banana-skins on the floor (outlined in the colour of the team that threw them, with a ring that counts their life down), the items that fell,
// the cooldown ring over each catapult, and the reactions to the sabotage events (splat, slip, catch, burst, cleaning). Reads `game.sab` and `game.floor`.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import type { TeamInfo } from '@pichi/core/lobby';
import { WINDUP_MS, FLIGHT_MS, LAND_AFTER_MS, type Flight } from '../../../sim/sabotage-config';
import { reticleAt, catapultState } from '../../../sim/rules/sabotage';
import { C, TILE, hexNum, R } from '@pichi/screen-kit/art';
import { OX, OY } from '../env/grid';
import { foodKey } from '../food';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { place } from '../stations';
import { arc, cooldownRing, light, tilePx, updateFloorViews, type FloorView, type PostView } from './sabotage-parts';
interface FlightView {
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  bag: Phaser.GameObjects.Image;
  k0: number;
}

export class SabotageView {
  private floor = new Map<number, FloorView>();
  private flights = new Map<Flight, FlightView>();
  private posts: PostView[] = [];
  private reticles: { img: Phaser.GameObjects.Image; line: Phaser.GameObjects.Graphics }[] = [];
  private off: (() => void)[] = [];
  private t = 0;

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: { teams: readonly TeamInfo[] | null } | undefined,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    const sab = game.sab!;
    this.reticles = game.teams.map(() => ({
      img: scene.add
        .image(0, 0, 'sab_reticle')
        .setScale((0.5 / R) * 1.3)
        .setDepth(2400)
        .setVisible(false),
      line: scene.add.graphics().setDepth(2390),
    }));
    this.posts = sab.catapults.map(([tx, ty]) => {
      const p = tilePx(tx, ty);
      return {
        ring: scene.add.graphics().setDepth(2300),
        label: makeText(scene, p.x, p.y - TILE * 0.62, '', { size: 24, color: C.cream, stroke: 5, depth: 2301 }),
        bag: place(scene, foodKey('bag'), p.x, p.y - TILE * 0.18, 0.6)
          .setDepth(100 + p.y + 20)
          .setVisible(false),
        cdFrom: 0,
        cdTo: 0,
        flash: 0,
      };
    });
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const colorOf = (team: number) => hexNum(this.view?.teams?.[team]?.color ?? '#888888');
    const bin = (team: number) => {
      const s = game.stations.find((x) => x.kind === 'trash' && x.owner === team);
      return s ? tilePx(s.tx, s.ty) : null;
    };
    const chefAt = (id: number) => {
      const q = game.players.get(id);
      return q ? { x: OX + q.x * TILE, y: OY + (q.y + 0.3) * TILE } : null;
    };
    on('sabotage:bagReady', (e) => {
      const b = bin(e.team);
      if (b) {
        this.fx.ring(b.x, b.y, 0xffd23f, 0.4, 1.7);
        this.fx.float(b.x, b.y - TILE * 0.55, '¡Bolsa!', C.cheese, 34);
      }
    });
    on('sabotage:launch', (e) => {
      const post = this.posts[e.team]!;
      post.cdFrom = game.time;
      post.cdTo = sab.teams[e.team]!.cooldownUntil;
      const p = tilePx(e.from[0], e.from[1]);
      this.fx.dustPoof(p.x, p.y - TILE * 0.2);
      this.fx.ring(p.x, p.y - TILE * 0.2, 0xffffff, 0.3, 1.2);
    });
    on('sabotage:burst', (e) => {
      const post = this.posts[e.team]!;
      post.cdFrom = game.time;
      post.cdTo = sab.teams[e.team]!.cooldownUntil;
      const p = tilePx(e.at[0], e.at[1]);
      this.fx.smokePuff(p.x, p.y - TILE * 0.3);
      this.fx.dustPoof(p.x, p.y);
      this.fx.float(p.x, p.y - TILE * 0.7, '¡Plof!', '#C9BBA7', 34);
    });
    on('sabotage:land', (e) => {
      for (const t of [e.tile, ...(e.extra ? [e.extra] : [])]) {
        const p = tilePx(t[0], t[1]);
        this.fx.ring(p.x, p.y, colorOf(e.team), 0.4, 1.8);
        this.fx.ring(p.x, p.y, 0xffffff, 0.2, 1.1);
        this.fx.dustPoof(p.x, p.y);
        this.fx.dustPoof(p.x, p.y);
        this.fx.bubbles(p.x, p.y);
      }
      this.fx.shake(90, 0.003);
    });
    on('sabotage:caught', (e) => {
      const c = chefAt(e.chef);
      if (!c) return;
      this.fx.starBurst(c.x, c.y - TILE * 0.5, 6);
      this.fx.ring(c.x, c.y - TILE * 0.3, 0xffd23f, 0.4, 1.8);
      this.fx.float(c.x, c.y - TILE * 1.2, '¡Atrapada!', C.cheese, 42);
    });
    on('sabotage:blocked', (e) => {
      this.posts[e.team]!.flash = 400;
    });
    on('chef:slip', (e) => {
      const c = chefAt(e.chef);
      if (!c) return;
      this.fx.starBurst(c.x, c.y - TILE * 0.6, 7);
      this.fx.ring(c.x, c.y, 0xffe45c, 0.4, 1.6);
      this.fx.float(c.x, c.y - TILE * 1.25, '¡Wuaaa!', '#FFE45C', 40);
      this.fx.shake(80, 0.003);
    });
    on('trash:picked', (e) => {
      const p = tilePx(e.tile[0], e.tile[1]);
      this.fx.starBurst(p.x, p.y - TILE * 0.2, 2);
      this.fx.ring(p.x, p.y, 0xffffff, 0.3, 1);
    });
    on('trash:binned', (e) => {
      const b = bin(e.team);
      if (!b) return;
      this.fx.ring(b.x, b.y, 0x7fd0f2, 0.4, 1.5);
      if (e.gained > 0)
        this.fx.float(
          b.x,
          b.y - TILE * 0.55,
          `+${e.gained === Math.floor(e.gained) ? e.gained : e.gained.toFixed(1)} basura`,
          '#BFE8F5',
          30,
        );
    });
    on('trash:decayed', (e) => {
      const p = tilePx(e.tile[0], e.tile[1]);
      this.fx.dustPoof(p.x, p.y);
    });
  }

  update(dtMs: number) {
    this.t += dtMs;
    const g = this.game,
      sab = g.sab;
    if (!sab) return;
    updateFloorViews(this.scene, g, this.view, this.floor, this.t);
    // the reticle and the dotted line of whoever is aiming
    sab.teams.forEach((st, i) => {
      const r = this.reticles[i]!;
      r.line.clear();
      if (!st.aim) {
        r.img.setVisible(false);
        return;
      }
      const target = (i + 1) % g.teams.length;
      const at = reticleAt(g, target, g.time - st.aim.t0);
      const to = tilePx(at[0], at[1]),
        from = tilePx(sab.catapults[i]![0], sab.catapults[i]![1]);
      const col = light(this.view?.teams?.[i]?.color ?? '#888888');
      r.img
        .setVisible(true)
        .setPosition(to.x, to.y)
        .setTint(col)
        .setRotation(this.t / 700)
        .setScale((0.5 / R) * 1.3 * (1 + 0.08 * Math.sin(this.t / 90)));
      r.line.fillStyle(col, 0.85);
      for (let k = 1; k < 14; k++) {
        const q = arc(from, to, k / 14, TILE * 1.5);
        r.line.fillStyle(0x2b1b17, 0.9).fillCircle(q.x, q.y - TILE * 0.3, 8);
        r.line.fillStyle(col, 1).fillCircle(q.x, q.y - TILE * 0.3, 5.5);
      }
      const left = 1 - (g.time - st.aim.t0) / 3000; // time left before it fires by itself
      r.line.lineStyle(6, 0x2b1b17, 0.7).strokeCircle(to.x, to.y, TILE * 0.62);
      r.line.lineStyle(4, left < 0.3 ? hexNum(C.danger) : col, 1);
      r.line.beginPath();
      r.line.arc(to.x, to.y, TILE * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left), false);
      r.line.strokePath();
    });

    // bags in the air and the shadow that warns where they land
    const live = new Set<Flight>();
    sab.teams.forEach((st) => st.flights.forEach((f) => live.add(f)));
    for (const f of live) {
      let v = this.flights.get(f);
      const to = tilePx(f.to[0], f.to[1]),
        from = tilePx(f.from[0], f.from[1]);
      if (!v) {
        v = {
          shadow: this.scene.add
            .image(to.x, to.y, 'sab_shadow')
            .setDepth(100 + to.y - 40)
            .setScale(0.1),
          ring: this.scene.add.graphics().setDepth(2380),
          bag: place(this.scene, foodKey('bag'), from.x, from.y, 0.8).setDepth(2500).setVisible(false),
          k0: 0,
        };
        v.k0 = v.bag.scaleX;
        this.flights.set(f, v);
      }
      const p = Math.min(1, (g.time - f.launchAt) / LAND_AFTER_MS);
      v.shadow.setScale((0.25 + 0.75 * p) * (TILE / 110) * 1.25).setAlpha(0.25 + 0.6 * p);
      const col = hexNum(this.view?.teams?.[f.by]?.color ?? '#888888');
      v.ring
        .clear()
        .lineStyle(6, col, 0.5 + 0.4 * Math.sin(this.t / 70))
        .strokeCircle(to.x, to.y, TILE * (0.62 - 0.22 * p));
      const flightT = (g.time - f.launchAt - WINDUP_MS) / FLIGHT_MS;
      if (flightT >= 0 && flightT <= 1) {
        const q = arc({ x: from.x, y: from.y - TILE * 0.3 }, to, flightT, TILE * 2.2);
        v.bag
          .setVisible(true)
          .setPosition(q.x, q.y)
          .setRotation(flightT * 7)
          .setScale(v.k0 * (0.9 + 0.55 * Math.sin(Math.PI * flightT)));
      } else v.bag.setVisible(false);
    }
    for (const [f, v] of [...this.flights])
      if (!live.has(f)) {
        v.shadow.destroy();
        v.ring.destroy();
        v.bag.destroy();
        this.flights.delete(f);
      }

    // each catapult's ring
    this.posts.forEach((post, i) => {
      post.flash = Math.max(0, post.flash - dtMs);
      cooldownRing(g, this.posts, i, catapultState(g, i));
    });
  }

  destroy() {
    for (const f of this.off) f();
    for (const v of this.floor.values()) {
      v.img.destroy();
      v.ring.destroy();
    }
    for (const v of this.flights.values()) {
      v.shadow.destroy();
      v.ring.destroy();
      v.bag.destroy();
    }
    for (const p of this.posts) {
      p.ring.destroy();
      p.label.destroy();
      p.bag.destroy();
    }
    for (const r of this.reticles) {
      r.img.destroy();
      r.line.destroy();
    }
    this.floor.clear();
    this.flights.clear();
    this.posts = [];
    this.reticles = [];
  }
}
