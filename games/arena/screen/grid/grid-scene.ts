// The grid prototype's Phaser scene: the 27x15 map in grey, up to 8 grey bodies with a team ring, and the telemetry overlay. No logic here.
import Phaser from 'phaser';
import { C, H, W } from '@pichi/screen-kit/art';
import { MAP_H, MAP_ROWS, MAP_W } from '../../map';
import { turnReport, type GridState } from '../../sim';

const PX = 56; // logical px per tile (5 cm on a 78" screen)
const UNIT = PX / 16;
const X0 = (W - MAP_W * PX) / 2;
const Y0 = 104 + (H - 104 - MAP_H * PX) / 2; // under the HUD band
const TEAM_COLOR = [0xe69f00, 0x0072b2]; // orange / blue (colour-blind safe pair)

export interface GridHost {
  state(): GridState | null;
  name(slot: number): string;
}

export class GridScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private host: GridHost) {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x2b2b2b);
    this.g = this.add.graphics();
    this.hud = this.add.text(24, 20, '', {
      fontFamily: 'monospace',
      fontSize: '30px',
      color: C.cream,
    });
    this.banner = this.add
      .text(W / 2, 52, '', {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: C.cream,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  update() {
    const s = this.host.state();
    this.g.clear();
    if (!s) {
      this.hud.setText('');
      this.banner.setText('');
      return this.labels.forEach((t) => t.setVisible(false));
    }
    this.drawMap();
    for (const b of s.bodies) this.drawBody(b.slot, b.team, b.x, b.y);
    const r = turnReport(s);
    const left = Math.max(0, Math.ceil((s.durationTicks - s.tick) / 60));
    this.hud.setText(
      `control ${s.control} · giros ${r.requested} · fallidos ${r.failed} (${(r.failedRate * 100).toFixed(1)} %) · tick ${s.tick}`,
    );
    this.banner.setText(s.over ? 'Fin del prototipo' : `${left} s`);
  }

  private drawMap() {
    this.g.fillStyle(0x4a4a4a, 1).fillRect(X0, Y0, MAP_W * PX, MAP_H * PX);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const solid = MAP_ROWS[y]![x] === '#';
        this.g
          .fillStyle(solid ? 0x1c1c1c : (x + y) % 2 ? 0x5a5a5a : 0x626262, 1)
          .fillRect(X0 + x * PX + 1, Y0 + y * PX + 1, PX - 2, PX - 2);
      }
    this.g.lineStyle(4, 0x888888, 1).strokeRect(X0, Y0, MAP_W * PX, MAP_H * PX);
  }

  private drawBody(slot: number, team: number, ux: number, uy: number) {
    const x = X0 + ux * UNIT,
      y = Y0 + uy * UNIT;
    this.g.fillStyle(0x000000, 0.3).fillCircle(x + 3, y + 5, PX * 0.42);
    this.g.fillStyle(0xa8a8a8, 1).fillCircle(x, y, PX * 0.4);
    const ring = TEAM_COLOR[team % 2]!;
    this.g.lineStyle(6, ring, 1).strokeCircle(x, y, PX * 0.4);
    if (team % 2 === 1) this.g.lineStyle(3, 0xffffff, 1).strokeCircle(x, y, PX * 0.26); // second ring: the team is not told by colour alone
    const t = this.label(slot);
    t.setVisible(true)
      .setPosition(x, y)
      .setText(String(slot + 1));
  }

  private label(slot: number): Phaser.GameObjects.Text {
    let t = this.labels.get(slot);
    if (!t) {
      t = this.add
        .text(0, 0, '', {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#111111',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.labels.set(slot, t);
    }
    return t;
  }
}
