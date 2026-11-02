// Manchazo's Phaser scene: the 27x15 floor with the paint of each team, pinatas with their fuse, the players (their avatar in the colour of their team; a grey disc without a look), and the HUD band.
// No logic here: it reads the sim's state each frame.
import Phaser from 'phaser';
import type { Appearance } from '@pichi/core/avatar';
import { C, FONT, W } from '@pichi/screen-kit/art';
import { MAP_W, formatSeed } from '../../map';
import { blastTiles, isHidden, percentOf, type ManchazoState } from '../../sim';
import { bannerOf, nextLine } from './event-banner';
import { drawEvents } from './scene-events';
import { drawLiving } from './scene-living';
import { floorBar } from './hud-bar';
import { BAR_H, BAR_Y, BOTTOM_Y, CLOCK_SIZE, FOOT_SIZE, HUD_TOP, PCT_SIZE, PX, SIDE_X, X0, Y0 } from './layout';
import { Avatars } from './scene-avatars';
import { TEAM_COLOR, bodyOutline } from './scene-body';
import { drawCarrier, drawMark, drawPickups, type Frame } from './scene-sabotage';
import { addBackdrop } from '../art/backdrop';
import { FRAME, floorTexture, BAKE } from '../art/floor-bake';
import { PaintLayer } from '../art/paint-layer';
import { drawPot, potLook } from '../art/pot';
import { Splashes } from '../art/splash';
import { A, num } from '../art/palette';

const UNIT = PX / 16;
const WARN_TICKS = 36; // a pinata shows the diamond it is about to paint this long before it goes off

export interface MatchHost {
  state(): ManchazoState | null;
  name(slot: number): string;
  look(slot: number): Appearance | undefined; // the player's own avatar; none: the grey disc
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
  private avatars!: Avatars; // rebuilt in create(): a scene that restarts destroys its game objects
  private paint!: PaintLayer; // same: the paint images and the floor image belong to the scene's display list
  private floor?: Phaser.GameObjects.Image;
  private splashes = new Splashes();

  constructor(private host: MatchHost) {
    super('arena');
  }

  create() {
    this.cameras.main.setBackgroundColor(num(A.cocoa));
    addBackdrop(this);
    this.floor = undefined;
    this.splashes = new Splashes();
    this.paint = new PaintLayer(this, X0, Y0, PX);
    this.g = this.add.graphics();
    this.avatars = new Avatars(this);
    const style = (color: string) => ({ fontFamily: FONT, fontSize: `${PCT_SIZE}px`, color, fontStyle: 'bold' });
    // the HUD starts at the top of the title-safe area (layout.ts): a TV that crops its edges still shows it
    this.pct = [
      this.add.text(SIDE_X, HUD_TOP, '', style('#E69F00')),
      this.add.text(SIDE_X + MAP_W * PX, HUD_TOP, '', style('#4aa8e0')).setOrigin(1, 0),
    ];
    this.clock = this.add.text(W / 2, HUD_TOP, '', { ...style(C.cream), fontSize: `${CLOCK_SIZE}px` }).setOrigin(0.5, 0);
    // the map seed, bottom left, in the 36 px band under the floor (above the bottom edge of the safe area): read it off the screen to play the same map again
    this.seed = this.add.text(X0, BOTTOM_Y, '', {
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: `${FOOT_SIZE}px`,
      color: '#E8DCC4',
      fontStyle: 'bold',
    });
    // F4: the announcement of each event (over the top of the floor), the "next event" line (bottom right) and the golden zone's x2
    this.next = this.add
      .text(X0 + MAP_W * PX, BOTTOM_Y, '', { fontFamily: FONT, fontSize: `${FOOT_SIZE}px`, color: '#E8DCC4', fontStyle: 'bold' })
      .setOrigin(1, 0);
    this.title = this.add
      .text(W / 2, Y0 + 14, '', {
        fontFamily: FONT,
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
        fontFamily: FONT,
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
        fontFamily: FONT,
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
    this.avatars.begin();
    if (!s) {
      this.pct.forEach((t) => t.setText(''));
      this.clock.setText('');
      this.seed.setText('');
      [this.next, this.title, this.sub, this.tag].forEach((t) => t.setText(''));
      return this.labels.forEach((t) => t.setVisible(false));
    }
    const f: Frame = { g: this.g, x0: X0, y0: Y0, px: PX };
    this.drawFloor(s);
    this.paint.sync(s.match.paint);
    drawLiving(f, s);
    drawPickups(f, s);
    drawEvents(f, s);
    this.drawPinatas(s, f);
    this.splashes.track(s, s.grid.map);
    this.splashes.draw(this.g, s, X0, Y0, PX);
    s.grid.bodies.forEach((b, i) => {
      const m = s.match.bodies[i]!;
      const x = X0 + b.x * UNIT,
        y = Y0 + b.y * UNIT;
      const ap = this.host.look(b.slot);
      let at = { x, y };
      if (ap) at = this.avatars.show(this.g, b.slot, ap, b.team, x, y, m.stun > 0, m.trail > 0);
      else bodyOutline(this.g, x, y, b.team, m.stun > 0, m.trail > 0);
      drawCarrier(f, s, i, x, y);
      this.label(b.slot, m.stun > 0)
        .setVisible(true)
        .setPosition(at.x, at.y)
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

  /** The floor is one baked image (frame, tiles, furniture); a new map swaps its texture. The paint of each tile is a layer over it (art/paint-layer.ts). */
  private drawFloor(s: ManchazoState) {
    const key = floorTexture(this, s.grid.map, PX);
    if (!this.floor)
      this.floor = this.add
        .image(X0 - FRAME, Y0 - FRAME, key)
        .setOrigin(0, 0)
        .setScale(1 / BAKE)
        .setDepth(-2);
    else if (this.floor.texture.key !== key) this.floor.setTexture(key);
  }

  private drawPinatas(s: ManchazoState, f: Frame) {
    for (const p of s.match.pinatas) {
      const cx = X0 + p.x * PX + PX / 2,
        cy = Y0 + p.y * PX + PX / 2;
      if (p.fuse <= WARN_TICKS) {
        const pulse = 0.25 + 0.2 * Math.sin(s.grid.tick / 3);
        for (const [x, y] of blastTiles(p.x, p.y, p.radius, s.grid.map)) {
          this.g.fillStyle(TEAM_COLOR[p.team]!, pulse).fillRect(X0 + x * PX + 4, Y0 + y * PX + 4, PX - 8, PX - 8);
          this.g.lineStyle(3, num(A.ink), 0.8).strokeRect(X0 + x * PX + 4, Y0 + y * PX + 4, PX - 8, PX - 8);
        }
      }
      drawPot(this.g, cx, cy, PX, potLook(p.team), Math.max(0, p.fuse) / 120, s.grid.tick);
      drawMark(f, s, p, cx, cy);
      const left = Math.max(0, p.fuse) / 120;
      this.g
        .lineStyle(4, 0xffe066, 0.9)
        .beginPath()
        .arc(cx, cy, PX * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false)
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
    this.g.fillStyle(num(A.frame), 1).fillRoundedRect(X0 - 4, BAR_Y - 4, w + 8, BAR_H + 8, 10);
    this.g.fillStyle(0xd9cdb4, 1).fillRoundedRect(X0, BAR_Y, w, BAR_H, 6); // the track: floor still unpainted
    this.g.fillStyle(TEAM_COLOR[0]!, 1).fillRoundedRect(X0, BAR_Y, bar.orange, BAR_H, { tl: 6, bl: 6, tr: 0, br: 0 });
    this.g.fillStyle(TEAM_COLOR[1]!, 1).fillRoundedRect(X0 + w - bar.blue, BAR_Y, bar.blue, BAR_H, { tl: 0, bl: 0, tr: 6, br: 6 });
    for (let k = 0; k < bar.orange - 6; k += 14) this.g.fillStyle(0xffffff, 0.6).fillCircle(X0 + 8 + k, BAR_Y + BAR_H / 2, 2.5); // dots / stripes: the bar tells the teams without colour too
    for (let k = 0; k < bar.blue - 6; k += 12) this.g.fillStyle(0xffffff, 0.55).fillRect(X0 + w - 10 - k, BAR_Y + 2, 4, BAR_H - 4);
  }

  /** The announcement banner (3 s), the next event, and the x2 over the golden zone. */
  private drawAnnouncements(s: ManchazoState) {
    const b = bannerOf(s, this.host.teamName.bind(this.host));
    if (b) {
      this.g.fillStyle(num(A.cocoa), 0.82).fillRoundedRect(X0 + 40, Y0 + 6, MAP_W * PX - 80, 146, 20);
      this.g.lineStyle(6, b.team >= 0 ? TEAM_COLOR[b.team]! : num(A.gold), 1).strokeRoundedRect(X0 + 40, Y0 + 6, MAP_W * PX - 80, 146, 20);
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
      t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', color: '#111111', fontStyle: 'bold' }).setOrigin(0.5).setDepth(31);
      this.labels.set(slot, t);
    }
    return t.setAlpha(stunned ? 0.5 : 1);
  }
}
