// The kitchen that mutates, drawn (sim/mutate is the rules): 3 s before, an alarm banner with a countdown and a pulsing hazard outline over the tiles about to change;
// at the change a white flash over those tiles, a shake, and the new tiles (ice and belts come from the existing SurfaceView). Only exists when `game.mut` does.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import { C, TILE, W, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { addSurfaces } from '../surfaces/surface-view';

const BANNER = { w: 900, h: 130, y: 330 } as const; // above the mid-round event banner (y 520): both can be up in the same 3 s
const ALARM = { main: '#D9482B', dark: '#8E2A16', stripe: 0xffd23f };

export class MutateView {
  private off: (() => void)[] = [];
  private t = 0;
  private banner: Phaser.GameObjects.Container | null = null;
  private count: Phaser.GameObjects.Text | null = null;
  private hazard: Phaser.GameObjects.Graphics;
  private tiles: { x: number; y: number }[] = [];
  private leftMs = 0;

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.hazard = scene.add.graphics().setDepth(1.6).setVisible(false); // over the floor, under the stations and chefs
    const tick = (_time: number, dtMs: number) => this.update(dtMs);
    scene.events.on('update', tick);
    this.hazard.once('destroy', () => {
      scene.events.off('update', tick); // goes away with the scene's children (the round's teardown removes them all)
      this.destroy();
    });
    this.off.push(bus.on('mutate:warn', (e) => this.warn(e.title, e.blurb, e.inMs, e.dests)));
    this.off.push(bus.on('mutate:apply', (e) => this.change(e.tiles)));
  }

  private warn(title: string, blurb: string, inMs: number, dests?: readonly (readonly [number, number])[]) {
    this.leftMs = inMs;
    this.tiles = this.game.mut ? this.game.mut.mutation.tiles.map((t) => ({ x: t.x, y: t.y })) : (dests ?? []).map(([x, y]) => ({ x, y })); // v2: the destinations the ops announce
    this.hazard.setVisible(true);
    const g = this.scene.add.graphics();
    g.fillStyle(0x2b1b17, 0.35).fillRoundedRect(-BANNER.w / 2 + 6, -BANNER.h / 2 + 10, BANNER.w, BANNER.h, 30);
    g.fillStyle(hexNum(ALARM.dark), 1).fillRoundedRect(-BANNER.w / 2, -BANNER.h / 2, BANNER.w, BANNER.h, 30);
    g.fillStyle(hexNum(ALARM.main), 1).fillRoundedRect(-BANNER.w / 2 + 8, -BANNER.h / 2 + 8, BANNER.w - 16, BANNER.h - 16, 24);
    g.fillStyle(ALARM.stripe, 1);
    for (let i = 0; i < 12; i++) g.fillRect(-BANNER.w / 2 + 30 + i * 70, BANNER.h / 2 - 22, 34, 8); // hazard dashes along the bottom
    g.lineStyle(7, hexNum(C.ink), 1).strokeRoundedRect(-BANNER.w / 2, -BANNER.h / 2, BANNER.w, BANNER.h, 30);
    // the texts sit left of the countdown digit (it is 84 px wide at the right edge): a long title ("¡SE REORDENA LA COCINA!") shrinks to fit instead of running under it
    const room = BANNER.w - 190,
      fit = (t: Phaser.GameObjects.Text) => t.setScale(Math.min(1, room / t.width));
    const text = fit(makeText(this.scene, -50, -26, title, { size: 60, color: C.cream, stroke: 9, depth: 0 }));
    const sub = fit(makeText(this.scene, -50, 24, blurb, { size: 30, color: '#FFF1D6', stroke: 5, depth: 0 }));
    this.count = makeText(this.scene, BANNER.w / 2 - 66, 0, String(Math.ceil(inMs / 1000)), {
      size: 84,
      color: C.cheese,
      stroke: 10,
      depth: 0,
    });
    this.banner = this.scene.add.container(W / 2, -140, [g, text, sub, this.count]).setDepth(2650);
    this.scene.tweens.add({ targets: this.banner, y: BANNER.y, duration: 380, ease: 'back.out' });
    this.fx.shake(150, 0.004);
  }

  private change(changed: { x: number; y: number }[]) {
    const b = this.banner;
    this.banner = null;
    this.count = null;
    if (b) this.scene.tweens.add({ targets: b, y: -180, alpha: 0, duration: 320, ease: 'cubic.in', onComplete: () => b.destroy() });
    this.hazard.clear().setVisible(false);
    addSurfaces(this.scene, this.game.grid); // the map had none before: this is the only SurfaceView of the round
    const flash = this.scene.add.graphics().setDepth(1.7);
    flash.fillStyle(0xffffff, 0.9);
    for (const t of changed) flash.fillRect(OX + t.x * TILE, OY + t.y * TILE, TILE, TILE);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: 700, ease: 'cubic.out', onComplete: () => flash.destroy() });
    this.fx.shake(450, 0.012);
  }

  update(dtMs: number) {
    this.t += dtMs;
    if (!this.banner) return;
    this.leftMs = Math.max(0, this.leftMs - dtMs);
    this.count?.setText(String(Math.ceil(this.leftMs / 1000)));
    const a = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(this.t / 110));
    this.hazard.clear();
    this.hazard.fillStyle(ALARM.stripe, a);
    this.hazard.lineStyle(4, hexNum(ALARM.main), 0.5 + a);
    for (const t of this.tiles) {
      this.hazard.fillRect(OX + t.x * TILE, OY + t.y * TILE, TILE, TILE);
      this.hazard.strokeRect(OX + t.x * TILE + 2, OY + t.y * TILE + 2, TILE - 4, TILE - 4);
    }
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
  }
}
