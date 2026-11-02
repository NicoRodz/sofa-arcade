// Manchazo's Phaser scene: the 27x15 floor with the paint of each team, pinatas with their fuse, the grey bodies with a team ring, and the HUD band.
// No logic here: it reads the sim's state each frame.
import Phaser from 'phaser';
import { C, W } from '@pichi/screen-kit/art';
import { MAP_W, formatSeed, solidAt, MAP_H } from '../../map';
import { blastTiles, isHidden, percentOf, type ManchazoState } from '../../sim';
import { bannerOf, nextLine } from './event-banner';
import { drawEvents } from './scene-events';
import { drawLiving } from './scene-living';
import { floorBar } from './hud-bar';
import { BAR_H, BAR_Y, BOTTOM_Y, CLOCK_SIZE, FOOT_SIZE, HUD_TOP, PCT_SIZE, PX, SIDE_X, X0, Y0 } from './layout';
import { TEAM_COLOR, bodyOutline } from './scene-body';
import { drawCarrier, drawMark, drawPickups, type Frame } from './scene-sabotage';

const UNIT = PX / 16;
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
  private seed!: Phaser.GameObjects.Text;
  private next!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private tag!: Phaser.GameObjects.Text;
  private labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private host: MatchHost) {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x2b2b2b);
    this.g = this.add.graphics();
    const style = (color: string) => ({ fontFamily: 'sans-serif', fontSize: `${PCT_SIZE}px`, color, fontStyle: 'bold' });
    // the HUD starts at the top of the title-safe area (layout.ts): a TV that crops its edges still shows it
    this.pct = [
      this.add.text(SIDE_X, HUD_TOP, '', style('#E69F00')),
      this.add.text(SIDE_X + MAP_W * PX, HUD_TOP, '', style('#4aa8e0')).setOrigin(1, 0),
    ];
    this.clock = this.add.text(W / 2, HUD_TOP, '', { ...style(C.cream), fontSize: `${CLOCK_SIZE}px` }).setOrigin(0.5, 0);
    // the map seed, bottom left, in the 36 px band under the floor (above the bottom edge of the safe area): read it off the screen to play the same map again
    this.seed = this.add.text(X0, BOTTOM_Y, '', {
      fontFamily: 'monospace',
      fontSize: `${FOOT_SIZE}px`,
      color: '#cfcfcf',
      fontStyle: 'bold',
    });
    // F4: the announcement of each event (over the top of the floor), the "next event" line (bottom right) and the golden zone's x2
    this.next = this.add
      .text(X0 + MAP_W * PX, BOTTOM_Y, '', { fontFamily: 'sans-serif', fontSize: `${FOOT_SIZE}px`, color: '#cfcfcf', fontStyle: 'bold' })
      .setOrigin(1, 0);
    this.title = this.add
      .text(W / 2, Y0 + 14, '', {
        fontFamily: 'sans-serif',
        fontSize: '72px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.sub = this.add
      .text(W / 2, Y0 + 100, '', {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.tag = this.add
      .text(0, 0, 'x2', {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: '#ffd23f',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  update() {
    const s = this.host.state();
    this.g.clear();
    if (!s) {
      this.pct.forEach((t) => t.setText(''));
      this.clock.setText('');
      this.seed.setText('');
      [this.next, this.title, this.sub, this.tag].forEach((t) => t.setText(''));
      return this.labels.forEach((t) => t.setVisible(false));
    }
    const f: Frame = { g: this.g, x0: X0, y0: Y0, px: PX };
    this.drawFloor(s);
    drawLiving(f, s);
    drawPickups(f, s);
    drawEvents(f, s);
    this.drawPinatas(s, f);
    s.grid.bodies.forEach((b, i) => {
      const m = s.match.bodies[i]!;
      const x = X0 + b.x * UNIT,
        y = Y0 + b.y * UNIT;
      bodyOutline(this.g, x, y, b.team, m.stun > 0, m.trail > 0);
      drawCarrier(f, s, i, x, y);
      this.label(b.slot, m.stun > 0)
        .setVisible(true)
        .setPosition(x, y)
        .setText(String(b.slot + 1));
    });
    this.drawHud(s);
    this.drawAnnouncements(s);
    this.seed.setText(s.mapSeed === null ? '' : `MAPA ${formatSeed(s.mapSeed)}`);
  }

  /** For the capture tool only: the real bounds (logical px) of the HUD texts, to prove they sit inside the safe area. */
  hudBounds(): Record<string, { x: number; y: number; w: number; h: number; text: string }> {
    const box = (t: Phaser.GameObjects.Text) => {
      const b = t.getBounds();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), text: t.text };
    };
    return { pctLeft: box(this.pct[0]!), pctRight: box(this.pct[1]!), clock: box(this.clock), seed: box(this.seed), next: box(this.next) };
  }

  private drawFloor(s: ManchazoState) {
    this.g.fillStyle(0x4a4a4a, 1).fillRect(X0, Y0, MAP_W * PX, MAP_H * PX);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const solid = solidAt(s.grid.map, x, y);
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

  private drawPinatas(s: ManchazoState, f: Frame) {
    for (const p of s.match.pinatas) {
      const cx = X0 + p.x * PX + PX / 2,
        cy = Y0 + p.y * PX + PX / 2;
      if (p.fuse <= WARN_TICKS) {
        for (const [x, y] of blastTiles(p.x, p.y, p.radius, s.grid.map))
          this.g.lineStyle(3, 0xffffff, 0.9).strokeRect(X0 + x * PX + 4, Y0 + y * PX + 4, PX - 8, PX - 8);
      }
      this.g.fillStyle(TEAM_COLOR[p.team]!, 1).fillCircle(cx, cy, PX * 0.3);
      this.g.lineStyle(4, 0xffffff, 1).strokeCircle(cx, cy, PX * 0.3);
      drawMark(f, s, p, cx, cy);
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
    const hidden = isHidden(s); // F4: the last 10 s are played blind: no percentages, no bar
    [0, 1].forEach((t) => this.pct[t]!.setText(`${t === 0 ? '▲' : '●'} ${hidden ? '??' : percentOf(s.match, t)} %`));
    const w = MAP_W * PX;
    const bar = floorBar(hidden ? [0, 0] : s.match.counts, s.match.paintable, w); // grey track = unpainted floor, orange from the left, blue from the right
    this.g.fillStyle(0x555555, 1).fillRect(X0, BAR_Y, w, BAR_H);
    this.g.fillStyle(TEAM_COLOR[0]!, 1).fillRect(X0, BAR_Y, bar.orange, BAR_H);
    this.g.fillStyle(TEAM_COLOR[1]!, 1).fillRect(X0 + w - bar.blue, BAR_Y, bar.blue, BAR_H);
  }

  /** The announcement banner (3 s), the next event, and the x2 over the golden zone. */
  private drawAnnouncements(s: ManchazoState) {
    const b = bannerOf(s, this.host.teamName.bind(this.host));
    if (b) {
      this.g.fillStyle(0x000000, 0.6).fillRoundedRect(X0 + 40, Y0 + 6, MAP_W * PX - 80, 146, 20);
      this.g.lineStyle(6, b.team >= 0 ? TEAM_COLOR[b.team]! : 0xffd23f, 1).strokeRoundedRect(X0 + 40, Y0 + 6, MAP_W * PX - 80, 146, 20);
    }
    this.title.setText(b?.title ?? '').setAlpha(b ? Math.min(1, b.age / 8) : 1);
    this.sub.setText(b?.sub ?? '');
    this.next.setText(nextLine(s));
    const z = s.match.zone;
    this.tag.setText(z ? 'x2' : '');
    if (z) this.tag.setPosition(X0 + ((z.x0 + z.x1 + 1) / 2) * PX, Y0 + ((z.y0 + z.y1 + 1) / 2) * PX);
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
