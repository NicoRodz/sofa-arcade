// Arena's Phaser scene: draws the platform and the fighters of the running round, every frame, from the state the host hands it. No logic here.
import Phaser from 'phaser';
import { C, H, W, hexNum } from '@pichi/screen-kit/art';
import { FIGHTER_R, RING_R0, type ArenaState } from '../sim';

export interface ArenaHost {
  state(): ArenaState | null;
  color(slot: number): string;
  name(slot: number): string;
}

export class ArenaScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Text;
  private labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private host: ArenaHost) {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor(C.cocoa);
    this.g = this.add.graphics();
    this.banner = this.add
      .text(W / 2, 90, '', { fontFamily: 'sans-serif', fontSize: '72px', color: C.cream, fontStyle: 'bold' })
      .setOrigin(0.5);
  }

  update() {
    const s = this.host.state();
    this.g.clear();
    this.banner.setText('');
    if (!s) return this.labels.forEach((t) => t.setVisible(false));
    const cx = W / 2,
      cy = H / 2 + 30;
    this.g.fillStyle(hexNum(C.steel2), 0.35).fillCircle(cx, cy, RING_R0 + 24); // the water the platform floats on
    this.g.fillStyle(hexNum(C.wood), 1).fillCircle(cx, cy, s.ringR);
    this.g.lineStyle(10, hexNum(C.wood2), 1).strokeCircle(cx, cy, s.ringR);
    for (const f of s.fighters) {
      const label = this.label(f.slot);
      label.setVisible(f.alive);
      if (!f.alive) continue;
      const x = cx + f.x,
        y = cy + f.y;
      this.g.fillStyle(0x000000, 0.25).fillCircle(x + 6, y + 10, FIGHTER_R);
      this.g.fillStyle(hexNum(this.host.color(f.slot)), 1).fillCircle(x, y, FIGHTER_R);
      this.g.lineStyle(5, hexNum(C.ink), 1).strokeCircle(x, y, FIGHTER_R);
      this.g.fillStyle(hexNum(C.cream), 1).fillCircle(x + f.fx * FIGHTER_R * 0.55, y + f.fy * FIGHTER_R * 0.55, 7); // where it faces
      label.setPosition(x, y - FIGHTER_R - 22).setText(this.host.name(f.slot));
    }
    if (s.over) this.banner.setText(s.winner === null ? 'Empate' : `¡Ganó ${this.host.name(s.winner)}!`);
  }

  private label(slot: number): Phaser.GameObjects.Text {
    let t = this.labels.get(slot);
    if (!t) {
      t = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '26px', color: C.cream, fontStyle: 'bold' }).setOrigin(0.5);
      this.labels.set(slot, t);
    }
    return t;
  }
}
