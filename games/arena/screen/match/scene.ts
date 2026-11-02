// Manchazo's Phaser scene: the 27x15 floor with the paint of each team, pinatas with their fuse, the grey bodies with a team ring, and the HUD band.
// No logic here: it reads the sim's state each frame.
import Phaser from 'phaser';
import { C, W } from '@pichi/screen-kit/art';
import { MAP_H, MAP_ROWS, MAP_W } from '../../map';
import { blastTiles, percentOf, type ManchazoState } from '../../sim';
import { TEAM_COLOR, bodyOutline } from './scene-body';

const PX = 56; // logical px per tile (5 cm on a 78" screen)
const UNIT = PX / 16;
const X0 = (W - MAP_W * PX) / 2;
const Y0 = 150; // under the HUD band (150 px, the plan's layout)
const WARN_TICKS = 36; // a pinata shows the diamond it is about to paint this long before it goes off

export interface MatchHost {
  state(): ManchazoState | null;
  name(slot: number): string;
  teamName(team: number): string;
}

export class MatchScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private pct: Phaser.GameObjects.Text[] = [];
  private clock!: Phaser.GameObjects.Text;
  private labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private host: MatchHost) {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x2b2b2b);
    this.g = this.add.graphics();
    const style = (color: string) => ({ fontFamily: 'sans-serif', fontSize: '56px', color, fontStyle: 'bold' });
    this.pct = [this.add.text(204, 36, '', style('#E69F00')), this.add.text(W - 204, 36, '', style('#4aa8e0')).setOrigin(1, 0)];
    this.clock = this.add.text(W / 2, 20, '', style(C.cream)).setOrigin(0.5, 0);
  }

  update() {
    const s = this.host.state();
    this.g.clear();
    if (!s) {
      this.pct.forEach((t) => t.setText(''));
      this.clock.setText('');
      return this.labels.forEach((t) => t.setVisible(false));
    }
    this.drawFloor(s);
    this.drawPinatas(s);
    s.grid.bodies.forEach((b, i) => {
      const m = s.match.bodies[i]!;
      const x = X0 + b.x * UNIT,
        y = Y0 + b.y * UNIT;
      bodyOutline(this.g, x, y, b.team, m.stun > 0, m.trail > 0);
      this.label(b.slot, m.stun > 0)
        .setVisible(true)
        .setPosition(x, y)
        .setText(String(b.slot + 1));
    });
    this.drawHud(s);
  }

  private drawFloor(s: ManchazoState) {
    this.g.fillStyle(0x4a4a4a, 1).fillRect(X0, Y0, MAP_W * PX, MAP_H * PX);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const solid = MAP_ROWS[y]![x] === '#';
        const team = s.match.paint[y * MAP_W + x]!;
        const px = X0 + x * PX,
          py = Y0 + y * PX;
        const base = solid ? 0x1c1c1c : team >= 0 ? TEAM_COLOR[team]! : (x + y) % 2 ? 0x5a5a5a : 0x626262;
        this.g.fillStyle(base, 1).fillRect(px + 1, py + 1, PX - 2, PX - 2);
        if (team === 0) this.g.fillStyle(0xffffff, 0.35).fillCircle(px + PX / 2, py + PX / 2, 5); // dot on orange, bar on blue: the teams differ without colour
        if (team === 1) this.g.fillStyle(0xffffff, 0.35).fillRect(px + 10, py + PX / 2 - 3, PX - 20, 6);
      }
    this.g.lineStyle(4, 0x888888, 1).strokeRect(X0, Y0, MAP_W * PX, MAP_H * PX);
  }

  private drawPinatas(s: ManchazoState) {
    for (const p of s.match.pinatas) {
      const cx = X0 + p.x * PX + PX / 2,
        cy = Y0 + p.y * PX + PX / 2;
      if (p.fuse <= WARN_TICKS) {
        for (const [x, y] of blastTiles(p.x, p.y, p.radius))
          this.g.lineStyle(3, 0xffffff, 0.9).strokeRect(X0 + x * PX + 4, Y0 + y * PX + 4, PX - 8, PX - 8);
      }
      this.g.fillStyle(TEAM_COLOR[p.team]!, 1).fillCircle(cx, cy, PX * 0.3);
      this.g.lineStyle(4, 0xffffff, 1).strokeCircle(cx, cy, PX * 0.3);
      const left = Math.max(0, p.fuse) / 120;
      this.g
        .lineStyle(5, 0xffe066, 1)
        .beginPath()
        .arc(cx, cy, PX * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false)
        .strokePath();
    }
  }

  private drawHud(s: ManchazoState) {
    const left = Math.max(0, Math.ceil((s.grid.durationTicks - s.grid.tick) / 60));
    this.clock.setText(s.grid.over ? '¡Fin!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    [0, 1].forEach((t) => this.pct[t]!.setText(`${t === 0 ? '▲' : '●'} ${percentOf(s.match, t)} %`));
    const total = s.match.counts[0]! + s.match.counts[1]!;
    const w = MAP_W * PX;
    this.g.fillStyle(0x333333, 1).fillRect(X0, 112, w, 16);
    if (total > 0) {
      const a = (w * s.match.counts[0]!) / total;
      this.g.fillStyle(TEAM_COLOR[0]!, 1).fillRect(X0, 112, a, 16);
      this.g.fillStyle(TEAM_COLOR[1]!, 1).fillRect(X0 + a, 112, w - a, 16);
    }
    this.g.fillStyle(0xffffff, 1).fillRect(X0 + w / 2 - 2, 106, 4, 28);
  }

  private label(slot: number, stunned: boolean): Phaser.GameObjects.Text {
    let t = this.labels.get(slot);
    if (!t) {
      t = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '26px', color: '#111111', fontStyle: 'bold' }).setOrigin(0.5);
      this.labels.set(slot, t);
    }
    return t.setAlpha(stunned ? 0.5 : 1);
  }
}
