// The rat of the Rat event, drawn: the little grey rat that runs across the floor with the item it took, and the rings and words of its three moments (appears, steals, is scared off).
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import { C, TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';
import { foodKey, ITEM_KIND } from '../food';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { place } from '../stations';
import { ratLift } from '../feel/rat-dodge';

export class RatView {
  private off: (() => void)[] = [];
  private v: {
    img: Phaser.GameObjects.Image;
    item: Phaser.GameObjects.Image | null;
    itemKey: string;
    lastX: number;
    face: 1 | -1;
    bob: number;
  } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const tilePx = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
    on('rat:appear', (e) => {
      const p = tilePx(e.at[0], e.at[1]);
      this.fx.ring(p.x, p.y, 0xffffff, 0.3, 1.4);
      this.fx.dustPoof(p.x, p.y);
      this.fx.float(p.x, p.y - TILE * 0.9, '¡Una rata!', '#E8DCC8', 38);
    });
    on('rat:steal', (e) => {
      const s = this.game.stations[e.station];
      if (!s) return;
      const p = tilePx(s.tx, s.ty);
      this.fx.ring(p.x, p.y, 0xd7263d, 0.3, 1.5);
      this.fx.float(p.x, p.y - TILE * 0.7, '¡Se lo llevó!', C.danger, 38);
    });
    on('rat:scared', (e) => {
      const r = this.game.mid?.rat;
      if (!r) return;
      const p = { x: OX + r.x * TILE, y: OY + r.y * TILE };
      this.fx.starBurst(p.x, p.y - TILE * 0.3, 7);
      this.fx.ring(p.x, p.y, 0xffe45c, 0.4, 1.8);
      this.fx.float(p.x, p.y - TILE * 0.9, e.returned ? '¡Fuera! Se salvó' : '¡Fuera!', C.cheese, 40);
    });
  }

  update(dtMs: number) {
    const r = this.game.mid?.rat;
    if (!r) {
      if (this.v) {
        this.v.img.destroy();
        this.v.item?.destroy();
        this.v = null;
      }
      return;
    }
    const x = OX + r.x * TILE,
      y = OY + r.y * TILE + TILE * 0.34;
    if (!this.v)
      this.v = { img: place(this.scene, 'rat', x, y, 0.92).setDepth(100 + y), item: null, itemKey: '', lastX: x, face: 1, bob: 0 };
    const v = this.v;
    if (Math.abs(x - v.lastX) > 0.1) v.face = x > v.lastX ? 1 : -1;
    v.lastX = x;
    v.bob += dtMs * (r.scared ? 0.05 : 0.026);
    v.img
      .setPosition(x, y - Math.abs(Math.sin(v.bob)) * 5 - ratLift(this.game))
      .setFlipX(v.face < 0)
      .setDepth(100 + y)
      .setAngle(Math.sin(v.bob) * 3 + (r.scared ? 8 * v.face : 0));
    const key = r.item ? foodKey(ITEM_KIND[r.item]) : '';
    if (key !== v.itemKey) {
      v.item?.destroy();
      v.item = null;
      v.itemKey = key;
      if (r.item) v.item = place(this.scene, key, x, y - TILE * 0.5, 0.62).setDepth(100 + y + 2);
    }
    v.item?.setPosition(x + v.face * TILE * 0.22, y - TILE * 0.38 - Math.abs(Math.sin(v.bob)) * 5).setDepth(100 + y + 2);
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    this.v?.img.destroy();
    this.v?.item?.destroy();
    this.v = null;
  }
}
