// The mid-round events, drawn (midround.ts is the rules): the big banner that announces the event 3 s before (icon, name, what it does, a countdown), the little pill under the
// clock while it lasts, and what each one looks like: the rush (red edges, bells), the inspector (his pill counts the dirty plates, a stamp at the windows when he leaves),
// the blackout (the kitchen goes dark, a crossed-out bolt over every oven), the birthday (balloons and confetti; the order's ticket is in hud.ts) and the rat (a little
// grey rat that runs across the floor, grabs an item and is scared off by a dash). Everything is drawn by code. Only exists when `game.mid` does.
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import type { TeamInfo } from '@pichi/core/lobby/teams';
import { ANNOUNCE_MS, EVENT_INFO, dirtyPlates, type EventKind } from '../../../sim/midround';
import { FrostView } from './frost-view';
import { Ev2View } from './ev2-view';
import { C, H, TILE, W, hexNum } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../env/grid';
import { foodKey, ITEM_KIND } from '../food';
import { type Fx, makeText } from '@pichi/screen-kit/art/fx';
import { place } from '../stations';
import { EVENT_COLOR } from './glyphs';
import { ratLift } from '../feel/rat-dodge';

// --- The view -------------------------------------------------------------------------------------------------------------------------------------------
interface Pill {
  root: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  kind: EventKind;
  w: number;
}

const BANNER = { w: 900, h: 150, y: 330 } as const;

const PILL = { w: 430, h: 46, y: 130, yVersus: 176 } as const; // versus: lower, under the tabs that hang from the score plates

export class EventsView {
  private off: (() => void)[] = [];
  private t = 0;
  private banner: Phaser.GameObjects.Container | null = null;
  private bannerCount: Phaser.GameObjects.Text | null = null;
  private bannerBar: Phaser.GameObjects.Graphics | null = null;
  private pill: Pill | null = null;
  private dark: Phaser.GameObjects.Rectangle;
  private darkNow = 0; // eased 0..1
  private frost: FrostView;
  private ev2: Ev2View | null;
  private bolts: Phaser.GameObjects.Image[] = [];
  private edges: Phaser.GameObjects.Graphics;
  private edgeT = 0;
  private rat: {
    img: Phaser.GameObjects.Image;
    item: Phaser.GameObjects.Image | null;
    itemKey: string;
    lastX: number;
    face: 1 | -1;
    bob: number;
  } | null = null;
  private stamps: Phaser.GameObjects.Text[] = [];

  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: { teams: readonly TeamInfo[] | null } | undefined,
    private fx: Fx,
    bus: Emitter<GameEvents>,
  ) {
    this.dark = scene.add
      .rectangle(W / 2, 104 + (H - 104) / 2, W, H - 104, 0x080b18)
      .setDepth(1850)
      .setAlpha(0)
      .setVisible(false);
    this.edges = scene.add.graphics().setDepth(1860).setVisible(false);
    this.frost = new FrostView(scene);
    this.ev2 = game.ev2 ? new Ev2View(scene, game, fx, bus) : null; // EVENTS_V2: the dark with cones, the board, the cake, the closing card
    const on = <K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void) => this.off.push(bus.on(k, fn));
    const winTile = (team?: number) => {
      const s = game.stations.find((x) => x.kind === 'window' && (team === undefined || x.owner === team));
      return s ? { x: OX + (s.tx + 0.5) * TILE, y: OY + (s.ty + 0.5) * TILE } : { x: W / 2, y: H / 2 };
    };
    const tilePx = (tx: number, ty: number) => ({ x: OX + (tx + 0.5) * TILE, y: OY + (ty + 0.5) * TILE });
    on('event:announce', (e) => this.showBanner(e.kind));
    on('event:start', (e) => this.start(e.kind));
    on('event:end', (e) => this.end(e.kind));
    on('event:inspector', (e) => {
      const p = winTile(e.team);
      const label = makeText(this.scene, p.x, p.y + TILE * 1.5, e.passed ? '¡APROBADO!' : '¡RECHAZADO!', {
        size: 46,
        color: e.passed ? C.basil : C.danger,
        stroke: 8,
        depth: 2450,
      })
        .setAngle(-8)
        .setScale(2.2)
        .setAlpha(0);
      this.stamps.push(label);
      this.scene.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 200, ease: 'back.out' });
      this.scene.tweens.add({
        targets: label,
        alpha: 0,
        y: label.y - 40,
        delay: 1500,
        duration: 500,
        onComplete: () => {
          label.destroy();
          this.stamps = this.stamps.filter((x) => x !== label);
        },
      });
      if (e.passed) {
        this.fx.float(p.x, p.y + TILE * 0.6, `+${e.points}`, C.cheese, 52);
        this.fx.confettiBurst(p.x, p.y);
        this.fx.starBurst(p.x, p.y - TILE * 0.3, 6);
      } else {
        this.fx.float(p.x, p.y + TILE * 0.6, 'Platos sucios', '#FF8D8D', 34);
        this.fx.shake(120, 0.004);
      }
    });
    on('rat:appear', (e) => {
      const p = tilePx(e.at[0], e.at[1]);
      this.fx.ring(p.x, p.y, 0xffffff, 0.3, 1.4);
      this.fx.dustPoof(p.x, p.y);
      this.fx.float(p.x, p.y - TILE * 0.9, '¡Una rata!', '#E8DCC8', 38);
    });
    on('rat:steal', (e) => {
      const s = game.stations[e.station];
      if (!s) return;
      const p = tilePx(s.tx, s.ty);
      this.fx.ring(p.x, p.y, 0xd7263d, 0.3, 1.5);
      this.fx.float(p.x, p.y - TILE * 0.7, '¡Se lo llevó!', C.danger, 38);
    });
    on('rat:scared', (e) => {
      const r = game.mid?.rat;
      if (!r) return;
      const p = { x: OX + r.x * TILE, y: OY + r.y * TILE };
      this.fx.starBurst(p.x, p.y - TILE * 0.3, 7);
      this.fx.ring(p.x, p.y, 0xffe45c, 0.4, 1.8);
      this.fx.float(p.x, p.y - TILE * 0.9, e.returned ? '¡Fuera! Se salvó' : '¡Fuera!', C.cheese, 40);
    });
  }

  // --- banner ---
  private showBanner(kind: EventKind) {
    this.banner?.destroy();
    const col = EVENT_COLOR[kind],
      info = EVENT_INFO[kind];
    const g = this.scene.add.graphics();
    g.fillStyle(0x2b1b17, 0.35).fillRoundedRect(-BANNER.w / 2 + 6, -BANNER.h / 2 + 10, BANNER.w, BANNER.h, 34);
    g.fillStyle(hexNum(col.dark), 1).fillRoundedRect(-BANNER.w / 2, -BANNER.h / 2, BANNER.w, BANNER.h, 34);
    g.fillStyle(hexNum(col.main), 1).fillRoundedRect(-BANNER.w / 2 + 8, -BANNER.h / 2 + 8, BANNER.w - 16, BANNER.h - 16, 28);
    g.lineStyle(7, hexNum(C.ink), 1).strokeRoundedRect(-BANNER.w / 2, -BANNER.h / 2, BANNER.w, BANNER.h, 34);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-BANNER.w / 2 + 24, -BANNER.h / 2 + 16, BANNER.w - 48, 10, 5);
    const icon = place(this.scene, `ev_${kind}`, -BANNER.w / 2 + 96, 0, 1.55);
    const title = makeText(this.scene, 40, -34, info.title, { size: 66, color: C.cream, stroke: 9, depth: 0 });
    const blurb = makeText(this.scene, 40, 22, kind === 'rat' && this.game.magnet ? 'Esquiva el dash: atrápala cuando jadee' : info.blurb, {
      size: 32,
      color: '#FFF1D6',
      stroke: 5,
      depth: 0,
    });
    const count = makeText(this.scene, BANNER.w / 2 - 66, 0, '3', { size: 92, color: C.cheese, stroke: 10, depth: 0 });
    const bar = this.scene.add.graphics();
    this.bannerCount = count;
    this.bannerBar = bar;
    const root = this.scene.add.container(W / 2, -140, [g, icon, title, blurb, count, bar]).setDepth(2650);
    this.banner = root;
    this.scene.tweens.add({ targets: root, y: BANNER.y, duration: 380, ease: 'back.out' });
    this.scene.tweens.add({ targets: icon, angle: { from: -10, to: 10 }, duration: 160, yoyo: true, repeat: -1 });
    this.fx.shake(150, 0.004);
  }
  private hideBanner() {
    const b = this.banner;
    if (!b) return;
    this.banner = null;
    this.bannerCount = null;
    this.bannerBar = null;
    this.scene.tweens.add({ targets: b, y: -180, alpha: 0, duration: 320, ease: 'cubic.in', onComplete: () => b.destroy() });
  }

  // --- the pill under the clock, while the event lasts ---
  private makePill(kind: EventKind): Pill {
    const col = EVENT_COLOR[kind],
      info = EVENT_INFO[kind];
    const w = kind === 'rat' && this.game.magnet ? 800 : PILL.w; // the gentle rat's line is longer
    const g = this.scene.add.graphics();
    g.fillStyle(0x2b1b17, 0.35).fillRoundedRect(-w / 2 + 3, -PILL.h / 2 + 4, w, PILL.h, 23);
    g.fillStyle(hexNum(col.main), 0.96).fillRoundedRect(-w / 2, -PILL.h / 2, w, PILL.h, 23);
    g.lineStyle(4, hexNum(C.ink), 1).strokeRoundedRect(-w / 2, -PILL.h / 2, w, PILL.h, 23);
    const icon = place(this.scene, `ev_${kind}`, -w / 2 + 28, 0, 0.5);
    const text = makeText(this.scene, 24, -2, info.title, { size: 25, color: C.cream, stroke: 4, depth: 0 });
    const bar = this.scene.add.graphics();
    const y = this.game.versus ? PILL.yVersus : PILL.y;
    const root = this.scene.add.container(W / 2, y - 90, [g, icon, text, bar]).setDepth(2640);
    this.scene.tweens.add({ targets: root, y, duration: 300, ease: 'back.out' });
    return { root, bar, text, kind, w: w };
  }

  private start(kind: EventKind) {
    this.hideBanner();
    this.pill?.root.destroy();
    this.pill = this.makePill(kind);
    this.fx.shake(220, 0.006);
    if (kind === 'rush') this.edgeT = 1400;
    if (kind === 'birthday') this.balloons();
  }
  private end(kind: EventKind) {
    const p = this.pill;
    if (p && p.kind === kind) {
      this.pill = null;
      this.scene.tweens.add({
        targets: p.root,
        y: p.root.y - 90,
        alpha: 0,
        duration: 300,
        ease: 'cubic.in',
        onComplete: () => p.root.destroy(),
      });
    }
    if (kind === 'blackout') this.fx.ring(W / 2, H / 2, 0xfff3b0, 0.5, 3);
  }

  private balloons() {
    const colors = [0xe63b2e, 0x2f7de1, 0x3fa34d, 0xffc21a, 0x8e5cd9, 0xff7a1a, 0xff5fa2, 0x1fb5a8];
    for (let i = 0; i < 16; i++) {
      const x = OX + 60 + Math.random() * (16 * TILE - 120);
      const b = place(this.scene, 'balloon', x, H + 80, 1.6 + Math.random() * 0.5)
        .setTint(colors[i % colors.length]!)
        .setDepth(2400);
      this.scene.tweens.add({
        targets: b,
        y: -140,
        x: x + (Math.random() - 0.5) * 160,
        duration: 2600 + Math.random() * 1400,
        delay: Math.random() * 500,
        ease: 'sine.out',
        onComplete: () => b.destroy(),
      });
      this.scene.tweens.add({ targets: b, angle: { from: -9, to: 9 }, duration: 500, yoyo: true, repeat: -1 });
    }
    this.fx.confettiBurst(W / 2, H / 2 + 80);
    this.fx.confettiBurst(W / 2 - 360, H / 2 + 80);
    this.fx.confettiBurst(W / 2 + 360, H / 2 + 80);
  }

  // --- every frame ---
  update(dtMs: number) {
    this.t += dtMs;
    const g = this.game,
      m = g.mid;
    if (!m) return;
    // the countdown on the banner
    if (this.banner && this.bannerCount && this.bannerBar) {
      const left = Math.max(0, m.startAt - g.time);
      this.bannerCount.setText(String(Math.max(1, Math.ceil(left / 1000))));
      const bar = this.bannerBar;
      bar.clear();
      bar.fillStyle(0x2b1b17, 0.5).fillRoundedRect(-BANNER.w / 2 + 40, BANNER.h / 2 - 24, BANNER.w - 80, 10, 5);
      bar
        .fillStyle(hexNum(C.cheese), 1)
        .fillRoundedRect(-BANNER.w / 2 + 40, BANNER.h / 2 - 24, (BANNER.w - 80) * Math.max(0, Math.min(1, left / ANNOUNCE_MS)), 10, 5);
      this.bannerCount.setScale(1 + 0.12 * Math.max(0, Math.sin((left / 1000) * Math.PI * 2)));
    }
    // the pill: what is left of the event; the inspector counts the dirty plates
    if (this.pill) {
      const p = this.pill,
        left = Math.max(0, m.endAt - g.time),
        total = Math.max(1, m.endAt - m.startAt);
      const bar = p.bar;
      bar.clear();
      bar.fillStyle(0x2b1b17, 0.45).fillRoundedRect(-p.w / 2 + 62, PILL.h / 2 - 11, p.w - 90, 6, 3);
      bar.fillStyle(hexNum(C.cream), 0.95).fillRoundedRect(-p.w / 2 + 62, PILL.h / 2 - 11, (p.w - 90) * Math.min(1, left / total), 6, 3);
      if (p.kind === 'inspector') {
        const counts = g.teams.map((t) => dirtyPlates(g, t.id));
        const label = g.versus ? g.teams.map((t, i) => `${this.view?.teams?.[i]?.icon ?? ''} ${counts[i]}`).join('   ') : String(counts[0]);
        p.text.setText(counts.every((n) => n === 0) ? '¡INSPECTOR! Todo limpio' : `¡INSPECTOR! Platos sucios: ${label}`);
        p.text.setColor(counts.every((n) => n === 0) ? '#B8F0C0' : C.cream);
      } else if (p.kind === 'rat')
        p.text.setText(
          m.rat?.item
            ? '¡Se llevó algo! Dash para espantarla'
            : g.magnet
              ? '¡UNA RATA! Esquiva el dash: atrápala cuando jadee · +50'
              : '¡UNA RATA! Dash para espantarla',
        );
      else if (p.kind === 'frost') p.text.setText(`¡OLA DE FRÍO! Todo resbala ${Math.ceil(left / 1000)} s`);
      else if (p.kind === 'blackout') p.text.setText(`¡CORTE DE LUZ! ${Math.ceil(left / 1000)} s`);
      else if (p.kind === 'rush') p.text.setText('¡HORA PUNTA! +3 pedidos');
      else if (p.kind === 'birthday') p.text.setText('¡CUMPLEAÑOS! Pedido de 150');
      p.text.setX(30);
    }
    this.frost.update(dtMs, m.frost);
    // the blackout: the kitchen darkens (a flicker when it starts), a crossed-out bolt over each oven
    const target = m.dark ? 1 : 0;
    this.darkNow += (target - this.darkNow) * Math.min(1, dtMs / 160);
    const flick = m.dark && g.time - m.startAt < 700 ? (Math.floor(this.t / 70) % 2 ? 0.55 : 1) : 1;
    const a = this.darkNow * flick;
    this.dark.setVisible(a > 0.01 && !this.ev2).setAlpha(0.66 * a);
    this.ev2?.update(dtMs);
    const ovens = g.stations.filter((s) => s.kind === 'pot');
    if (m.dark && !this.bolts.length)
      for (const s of ovens)
        this.bolts.push(
          place(this.scene, 'ev_nopower', OX + (s.tx + 0.5) * TILE, OY + (s.ty + 0.5) * TILE - TILE * 0.5, 1.25).setDepth(1900),
        );
    else if (!m.dark && this.bolts.length) {
      for (const b of this.bolts) b.destroy();
      this.bolts = [];
    }
    this.bolts.forEach((b, i) => {
      const s = ovens[i]!;
      b.setY(OY + (s.ty + 0.5) * TILE + (s.ty <= 1 ? TILE * 0.95 : -TILE * 0.5) + Math.sin(this.t / 160 + i) * 3).setAlpha(
        0.7 + Math.sin(this.t / 200) * 0.25,
      );
    });
    // the rush: red edges for a moment
    if (this.edgeT > 0) {
      this.edgeT = Math.max(0, this.edgeT - dtMs);
      const k = this.edgeT / 1400,
        e = this.edges;
      e.clear();
      const pulse = 0.5 + 0.5 * Math.sin(this.t / 60);
      e.lineStyle(26, hexNum(C.danger), 0.5 * k * (0.6 + 0.4 * pulse)).strokeRect(13, 117, W - 26, H - 130);
      e.setVisible(true);
    } else this.edges.setVisible(false);
    this.updateRat(dtMs);
  }

  private updateRat(dtMs: number) {
    const r = this.game.mid?.rat;
    if (!r) {
      if (this.rat) {
        this.rat.img.destroy();
        this.rat.item?.destroy();
        this.rat = null;
      }
      return;
    }
    const x = OX + r.x * TILE,
      y = OY + r.y * TILE + TILE * 0.34;
    if (!this.rat)
      this.rat = { img: place(this.scene, 'rat', x, y, 0.92).setDepth(100 + y), item: null, itemKey: '', lastX: x, face: 1, bob: 0 };
    const v = this.rat;
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
    this.banner?.destroy();
    this.pill?.root.destroy();
    this.dark.destroy();
    this.frost.destroy();
    this.ev2?.destroy();
    this.edges.destroy();
    for (const b of this.bolts) b.destroy();
    this.rat?.img.destroy();
    this.rat?.item?.destroy();
    for (const s of this.stamps) s.destroy();
    this.banner = null;
    this.pill = null;
    this.bolts = [];
    this.rat = null;
    this.stamps = [];
  }
}
