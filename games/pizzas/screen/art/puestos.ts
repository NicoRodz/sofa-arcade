// Suggested stations on the big screen: during the countdown and the first seconds each chef wears a pill with the puesto
// and its stations glow in the chef's colour; afterwards only a small icon stays over the head. Nothing here blocks play.
import type Phaser from 'phaser';
import { ICONS, type IconId } from '@pichi/core/icons';
import { PUESTOS, puestoStations, type PuestoId } from '../../sim/puestos';
import type { Game } from '../../sim/overcooked';
import { C, OX, OY, TILE, chefOf, hexNum } from '@pichi/screen-kit/art/tokens';
import { makeText } from '@pichi/screen-kit/art/fx';
import type { Chef } from '@pichi/screen-kit/art/chef';

export const BIG_MS = 11_000; // 3 s countdown + 8 s of play
export const CHANGE_MS = 8_000; // a puesto picked with "Cambiar" lights up again for this long
export interface PuestoView {
  ids: PuestoId[];
  stamp: number;
} // stamp changes when the assignment does

const iconKey = (id: IconId) => `pi_${id}`;
// The line icons are SVG strings: rasterised once into textures (async, so marks wait for them).
export function buildPuestoIcons(scene: Phaser.Scene) {
  for (const id of Object.keys(ICONS) as IconId[]) {
    const key = iconKey(id);
    if (scene.textures.exists(key)) continue;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="#2B1B17" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>`;
    const img = new Image();
    img.onload = () => {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

interface Mark {
  stamp: number;
  t: number;
  stations: number[];
  color: number;
  root: Phaser.GameObjects.Container;
  big: Phaser.GameObjects.Container;
  small: Phaser.GameObjects.Container;
}

export class PuestoMarks {
  private marks = new Map<number, Mark>();
  private glow: Phaser.GameObjects.Graphics;
  private clock = 0;

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: () => Map<number, PuestoView>,
  ) {
    this.glow = scene.add.graphics().setDepth(90);
  }

  private build(slot: number, v: PuestoView, t: number, stations: number[]): Mark {
    const s = this.scene;
    const ch = chefOf(slot),
      color = hexNum(ch.color);
    const ids = v.ids.slice(0, 2);
    const label = makeText(s, 0, 0, ids.map((i) => PUESTOS[i].name).join(' + '), {
      size: 28,
      color: C.cream,
      stroke: 5,
      depth: 0,
    }).setOrigin(0, 0.5);
    const w = 64 + label.width + 16;
    const pill = s.add.graphics();
    pill.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 2, -24 + 5, w, 52, 26);
    pill
      .fillStyle(color, 1)
      .fillRoundedRect(-w / 2, -26, w, 52, 26)
      .lineStyle(5, 0x2b1b17, 1)
      .strokeRoundedRect(-w / 2, -26, w, 52, 26);
    pill.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 14, -22, w - 28, 7, 3);
    const disc = (x: number, r: number, id: PuestoId) => {
      const g = s.add.graphics();
      g.fillStyle(hexNum(C.cream), 1).fillCircle(x, 0, r).lineStyle(4, 0x2b1b17, 1).strokeCircle(x, 0, r);
      const out: Phaser.GameObjects.GameObject[] = [g];
      const key = iconKey(PUESTOS[id].icon);
      if (s.textures.exists(key)) out.push(s.add.image(x, 0, key).setDisplaySize(r * 1.45, r * 1.45));
      return out;
    };
    label.setPosition(-w / 2 + 56, 1);
    const big = s.add.container(0, 0, [pill, ...disc(-w / 2 + 29, 21, ids[0]!), label]);
    const smallParts: Phaser.GameObjects.GameObject[] = [];
    ids.forEach((id, i) => {
      const x = (i - (ids.length - 1) / 2) * 44;
      const ring = s.add.graphics().lineStyle(7, color, 1).strokeCircle(x, 0, 21);
      smallParts.push(ring, ...disc(x, 19, id));
    });
    const small = s.add.container(0, 0, smallParts).setAlpha(0);
    const root = s.add.container(0, 0, [big, small]).setDepth(1500);
    return { stamp: v.stamp, t, stations, color, root, big, small };
  }

  update(dtMs: number, chefs: Map<number, Chef>) {
    this.clock += dtMs;
    const views = this.view();
    for (const [id, m] of this.marks)
      if (!views.has(id) || !chefs.has(id)) {
        m.root.destroy();
        this.marks.delete(id);
      }
    const g = this.glow;
    g.clear();
    for (const [id, chef] of chefs) {
      const v = views.get(id),
        gp = this.game.players.get(id);
      if (!v || !gp) continue;
      let m = this.marks.get(id);
      if (m && m.stamp !== v.stamp) {
        const t = BIG_MS - CHANGE_MS;
        m.root.destroy();
        m = undefined;
        this.marks.delete(id);
        this.make(id, gp.slot, gp.spawn, v, t);
        m = this.marks.get(id);
      }
      if (!m) {
        this.make(id, gp.slot, gp.spawn, v, 0);
        m = this.marks.get(id);
      }
      if (!m) continue;
      m.t += dtMs;
      const bigK = Math.max(0, Math.min(1, (BIG_MS - m.t) / 600)); // 1 while big, fades into the small icon
      m.big.setAlpha(bigK);
      m.small.setAlpha(1 - bigK);
      m.root.setPosition(chef.root.x, chef.root.y - TILE * 1.6);
      if (bigK > 0) {
        const pulse = 0.55 + 0.45 * Math.sin(this.clock / 170);
        const inset = 5 + 6 * ([...this.marks.keys()].indexOf(id) % 3);
        for (const si of m.stations) {
          const st = this.game.stations[si];
          if (!st) continue;
          const x = OX + st.tx * TILE,
            y = OY + st.ty * TILE;
          g.fillStyle(m.color, 0.16 * bigK * pulse).fillRoundedRect(x + 3, y + 3, TILE - 6, TILE - 6, 12);
          g.lineStyle(7, 0x2b1b17, 0.55 * bigK).strokeRoundedRect(
            x + inset - 2,
            y + inset - 2,
            TILE - 2 * inset + 4,
            TILE - 2 * inset + 4,
            12,
          );
          g.lineStyle(5, m.color, (0.55 + 0.45 * pulse) * bigK).strokeRoundedRect(
            x + inset,
            y + inset,
            TILE - 2 * inset,
            TILE - 2 * inset,
            12,
          );
        }
      }
    }
  }

  private make(id: number, slot: number, spawn: number, v: PuestoView, t: number) {
    const sp = this.game.spawns[spawn] ?? this.game.spawns[0]!;
    const stations = puestoStations(this.game.grid, this.game.stations, v.ids, sp);
    this.marks.set(id, this.build(slot, v, t, stations));
  }

  destroy() {
    for (const m of this.marks.values()) m.root.destroy();
    this.marks.clear();
    this.glow.destroy();
  }
}
