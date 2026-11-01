// EVENTS_V2, drawn (the rules are sim/ev2/): the dark kitchen with a cone of light per chef and a glow at every oven, the light board and its ring, the red-ticket pill and the amber
// edges of the Hora punta, the cake's candle drawer, balloons and party lights, the amber glow of the spill and the 2 s closing card. Only exists when `game.ev2` does.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import type { Emitter, GameEvents } from '../../../sim/round/events';
import { HOLD_MS } from '../../../sim/ev2/state';
import { C, H, TILE, W, hexNum } from '@pichi/screen-kit/art';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { OX, OY } from '../env/grid';

const TOP = 104; // the HUD strip: never darkened
const DARK_A = 0.85;
const CONE_TILES = 2.5; // radius of a chef's light
const CH_W = W / 2;
const CH_H = (H - TOP) / 2; // the dark sheet is drawn at half resolution and scaled up
const CARD_MS = 2000;

export class Ev2View {
  private off: (() => void)[] = [];
  private t = 0;
  private darkNow = 0;
  private sheet: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private gfx: Phaser.GameObjects.Graphics; // board, drawer, edges, balloons, lights, spill
  private pill: Phaser.GameObjects.Text;
  private card: Phaser.GameObjects.Container | null = null;
  private deflate = 0; // ms left of the balloon that lost its air
  private party = 0; // ms of confetti left
  private flash = 0; // the 3 flickers when the light comes back

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.sheet = scene.textures.createCanvas(`ev2_dark_${Math.random().toString(36).slice(2, 8)}`, CH_W, CH_H)!;
    this.img = scene.add
      .image(W / 2, TOP + (H - TOP) / 2, this.sheet.key)
      .setScale(2)
      .setDepth(1851)
      .setVisible(false);
    this.gfx = scene.add.graphics().setDepth(1905);
    this.pill = makeText(scene, W / 2, 178, '', { size: 30, color: C.cheese, stroke: 7, depth: 2300 }).setVisible(false);
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    on('event:end', (e) => {
      if (e.kind === 'blackout') this.flash = 900;
    });
    on('ev2:cake', (e) => {
      if (e.step === 'expired') this.deflate = 1400;
      if (e.step === 'candle')
        this.fx.starBurst(OX + (game.ev2!.cake!.drawer.tx + 0.5) * TILE, OY + (game.ev2!.cake!.drawer.ty + 0.5) * TILE, 8);
    });
    on('ev2:close', (e) => this.showCard(e));
  }

  private showCard(e: GameEvents['ev2:close']) {
    this.card?.destroy();
    const col = e.ok ? 0x2fbf71 : 0xd7263d;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-300, -112, 600, 240, 36);
    bg.fillStyle(col, 1).fillRoundedRect(-310, -120, 620, 240, 36);
    bg.lineStyle(7, hexNum(C.ink), 1).strokeRoundedRect(-310, -120, 620, 240, 36);
    const num = e.points === 0 ? '' : `${e.points > 0 ? '+' : ''}${e.points}`;
    const who = e.by !== undefined ? `${e.detail} · Chef ${(this.game.players.get(e.by)?.slot ?? 0) + 1}` : e.detail;
    const items = [
      bg,
      makeText(this.scene, 0, -68, e.title, { size: 46, color: '#ffffff', stroke: 8, depth: 0 }),
      makeText(this.scene, 0, 8, num, { size: 84, color: e.ok ? C.cheese : '#ffffff', stroke: 10, depth: 0 }),
      makeText(this.scene, 0, 84, who, { size: 28, color: '#ffffff', stroke: 6, depth: 0 }),
    ];
    this.card = this.scene.add
      .container(W / 2, H / 2 - 40, items)
      .setDepth(2600)
      .setScale(0.4)
      .setAlpha(0);
    this.scene.tweens.add({ targets: this.card, scale: 1, alpha: 1, duration: 220, ease: 'back.out' });
    const c = this.card;
    this.scene.tweens.add({ targets: c, alpha: 0, delay: CARD_MS - 300, duration: 300, onComplete: () => c.destroy() });
    if (e.ok && (e.kind === 'birthday' || e.title.includes('perfecto'))) {
      this.party = e.kind === 'birthday' ? 3000 : 1200; // 3 s of confetti for the cake
      this.fx.confettiBurst(W / 2, H / 2 - 40);
    } else if (!e.ok) this.fx.shake(140, 0.004);
  }

  update(dtMs: number) {
    this.t += dtMs;
    const g = this.game,
      e = g.ev2!,
      m = g.mid;
    const gfx = this.gfx;
    gfx.clear();
    // --- the dark kitchen
    const dark = !!m?.dark;
    this.darkNow += ((dark ? 1 : 0) - this.darkNow) * Math.min(1, dtMs / 160);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dtMs);
    const flick = this.flash > 0 ? (Math.floor(this.flash / 150) % 2 ? 0.1 : 0.5) * (this.flash / 900) : 1; // "clunk" and three flickers
    const a = this.darkNow > 0.01 ? this.darkNow : this.flash > 0 ? 1 : 0;
    this.img.setVisible(a > 0.01);
    if (a > 0.01) this.drawSheet(dark ? a : flick);
    // --- the board
    if (dark && e.board) this.drawBoard(gfx, e);
    // --- hora punta
    const r = e.rush;
    const rushOn = !!r && !r.closed;
    if (rushOn) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t / 220);
      gfx.lineStyle(22, 0xffa51f, 0.28 + 0.3 * pulse).strokeRect(11, TOP + 9, W - 22, H - TOP - 20);
      gfx.fillStyle(0xff9a1f, 0.05).fillRect(0, TOP, W, H - TOP); // warm light
    }
    // --- cumpleaños
    const k = e.cake;
    const cakeOn = !!k && !k.closed;
    if (cakeOn) this.drawParty(gfx, k, g.time);
    else if (this.deflate > 0) this.drawBalloons(gfx, true);
    this.deflate = Math.max(0, this.deflate - dtMs);
    if (this.party > 0 && Math.floor(this.t / 400) !== Math.floor((this.t - dtMs) / 400))
      this.fx.confettiBurst(300 + ((this.t * 7) % (W - 600)), 200);
    this.party = Math.max(0, this.party - dtMs);
    // --- spill: amber glow on the patches
    if (m?.kind === 'spill' && m.phase === 'active' && g.mech?.tile)
      g.mech.tile.forEach((v, i) => {
        if (v !== 1) return;
        const x = OX + ((i % 16) + 0.5) * TILE,
          y = OY + (Math.floor(i / 16) + 0.5) * TILE;
        gfx.fillStyle(0xffb02e, 0.22 + 0.12 * Math.sin(this.t / 200 + i)).fillCircle(x, y, TILE * 0.62);
      });
    // --- the pill: red tickets x/y, or the cake's countdown
    const txt = rushOn
      ? `¡HORA PUNTA!  a tiempo ${r!.ok}/${r!.total}`
      : cakeOn
        ? `TORTA  ${k!.candled ? 'con vela: ¡entrégala!' : 'falta la vela'}  ${this.cakeLeft(g)} s`
        : '';
    this.sync();
    this.pill
      .setVisible(!!txt)
      .setText(txt)
      .setColor(rushOn ? '#FFB02E' : '#FF8CC4');
  }

  private cakeLeft = (g: Game) => Math.max(0, Math.ceil(((g.teams[0]!.orders.find((o) => o.cake)?.expiresAt ?? g.time) - g.time) / 1000));

  private drawSheet(alpha: number) {
    const ctx = this.sheet.context;
    const g = this.game;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CH_W, CH_H);
    ctx.fillStyle = `rgba(5,6,15,${DARK_A * alpha})`;
    ctx.fillRect(0, 0, CH_W, CH_H);
    ctx.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, rad: number, k: number) => {
      const cx = x / 2,
        cy = (y - TOP) / 2,
        rr = rad / 2;
      const gr = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
      gr.addColorStop(0, `rgba(0,0,0,${k})`);
      gr.addColorStop(0.3, `rgba(0,0,0,${k * 0.5})`); // a quick falloff: the cone is a cone, the floor between chefs stays dark
      gr.addColorStop(0.65, `rgba(0,0,0,${k * 0.14})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    };
    for (const p of g.players.values()) if (!p.ghost) hole(OX + p.x * TILE, OY + p.y * TILE, CONE_TILES * TILE, 1);
    for (const s of g.stations)
      if (s.kind === 'pot') hole(OX + (s.tx + 0.5) * TILE, OY + (s.ty + 0.5) * TILE, TILE * (s.wood ? 2.2 : 1.1), s.wood ? 0.85 : 0.5); // the wood oven keeps cooking: it glows more
    const b = g.ev2!.board;
    if (b) hole(OX + (b.tx + 0.5) * TILE, OY + (b.ty + 0.5) * TILE, TILE * 1.5, 0.7); // so it can be found
    ctx.globalCompositeOperation = 'source-over';
    this.sheet.refresh();
  }

  private drawBoard(gfx: Phaser.GameObjects.Graphics, e: NonNullable<Game['ev2']>) {
    const b = e.board!;
    const x = OX + (b.tx + 0.5) * TILE,
      y = OY + (b.ty + 0.5) * TILE;
    const pulse = 0.5 + 0.5 * Math.sin(this.t / 180);
    gfx.fillStyle(0x10131f, 1).fillRoundedRect(x - TILE * 0.42, y - TILE * 0.42, TILE * 0.84, TILE * 0.84, 8);
    gfx.lineStyle(5, 0xffe45c, 0.6 + 0.4 * pulse).strokeRoundedRect(x - TILE * 0.42, y - TILE * 0.42, TILE * 0.84, TILE * 0.84, 8);
    // a bolt
    gfx
      .fillStyle(0xffe45c, 1)
      .fillTriangle(x + 6, y - 24, x - 14, y + 4, x + 2, y + 4)
      .fillTriangle(x + 15, y - 6, x - 7, y + 26, x - 2, y - 6);
    const prog = Math.min(1, e.hold / HOLD_MS[this.game.difficulty]);
    gfx
      .lineStyle(10, 0x000000, 0.5)
      .beginPath()
      .arc(x, y, TILE * 0.62, 0, Math.PI * 2)
      .strokePath();
    if (prog > 0)
      gfx
        .lineStyle(10, 0x6dff9a, 1)
        .beginPath()
        .arc(x, y, TILE * 0.62, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2)
        .strokePath();
    if (!this.label)
      this.label = makeText(this.scene, x, y - TILE * 1.05, 'Mantén B: Subir luz', { size: 26, color: '#FFE45C', stroke: 7, depth: 1910 });
    this.label.setPosition(x, y - TILE * 1.05).setVisible(true);
  }
  private label: Phaser.GameObjects.Text | null = null;

  private drawBalloons(gfx: Phaser.GameObjects.Graphics, deflating = false) {
    const cols = [0xff5fa8, 0xffd23f, 0x4dd0e1, 0xa78bfa, 0x6dff9a];
    cols.forEach((c, i) => {
      const bx = i < 3 ? 60 + i * 52 : W - 60 - (i - 3) * 52;
      const sag = deflating && i === 0 ? 1 - this.deflate / 1400 : 0; // the first balloon loses its air and falls
      const by = TOP + 80 + Math.sin(this.t / 600 + i) * 8 + sag * 260;
      const rr = 22 * (1 - sag * 0.55);
      gfx.fillStyle(c, 1).fillEllipse(bx, by, rr * 2, rr * 2.5);
      gfx.lineStyle(2, 0xffffff, 0.6).strokeEllipse(bx, by, rr * 2, rr * 2.5);
      gfx.lineStyle(2, 0xffffff, 0.6).lineBetween(bx, by + rr * 1.25, bx + 4, by + 80);
    });
  }

  private drawParty(gfx: Phaser.GameObjects.Graphics, k: NonNullable<Game['ev2']>['cake'] & object, time: number) {
    const cols = [0xff5fa8, 0xffd23f, 0x4dd0e1, 0xa78bfa, 0x6dff9a];
    for (let i = 0; i < 24; i++) {
      const on = (Math.floor(this.t / 260) + i) % 5;
      gfx.fillStyle(cols[on]!, 0.9).fillCircle(20 + i * ((W - 40) / 23), TOP + 8 + Math.sin(i) * 3, 7);
    }
    this.drawBalloons(gfx);
    const x = OX + (k.drawer.tx + 0.5) * TILE,
      y = OY + (k.drawer.ty + 0.5) * TILE;
    if (!k.candled) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t / 160);
      gfx.fillStyle(0xff5fa8, 0.25 + 0.2 * pulse).fillCircle(x, y, TILE * 0.8);
      gfx.fillStyle(0xfff3c4, 1).fillRoundedRect(x - 6, y - 26, 12, 36, 3); // a candle
      gfx.fillStyle(0xff7a1a, 1).fillEllipse(x, y - 34 - pulse * 3, 12, 20);
      gfx.fillStyle(0xffe45c, 1).fillEllipse(x, y - 32 - pulse * 3, 6, 11);
      gfx.lineStyle(5, 0xff5fa8, 1).strokeRoundedRect(x - TILE * 0.45, y - TILE * 0.45, TILE * 0.9, TILE * 0.9, 8);
      if (!this.drawerLabel)
        this.drawerLabel = makeText(this.scene, x, y + TILE * 0.95, 'A: Vela', { size: 26, color: '#FF8CC4', stroke: 7, depth: 1910 });
      this.drawerLabel.setPosition(x, y + TILE * 0.95).setVisible(true);
    } else this.drawerLabel?.setVisible(false);
    void time;
  }
  private drawerLabel: Phaser.GameObjects.Text | null = null;

  /** Hide the labels of the board and the drawer once their thing is over. */
  sync() {
    const e = this.game.ev2!;
    if (!(this.game.mid?.dark && e.board)) this.label?.setVisible(false);
    if (!e.cake || e.cake.closed) this.drawerLabel?.setVisible(false);
  }

  destroy() {
    for (const f of this.off) f();
    this.off = [];
    this.img.destroy();
    this.sheet.destroy();
    this.gfx.destroy();
    this.pill.destroy();
    this.label?.destroy();
    this.drawerLabel?.destroy();
    this.card?.destroy();
  }
}
