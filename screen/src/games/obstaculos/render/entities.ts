// Stateful things of the level drawn from WorldView.entities: stars, checkpoints, goal, rings, boxes, keys, plates, levers, gates,
// ladders, movers, balances, crumbling tiles and the hint signs. Static art is baked into textures; geometry that changes is
// redrawn into a Graphics only when its signature changes.
import Phaser from 'phaser';
import { TILE, type Biome } from '@party/shared/obstaculos';
import { C, FONT } from '../../../art/tokens';
import { R, circle, drawOutlined, makeTex, rr, star as starPath, texSize, vgrad, type Ctx } from '../../../art/gfx';
import { INK, PALETTES, hexToInt, tagColor } from './biome';
import { drawCrumble, drawLadder, type CellCtx } from './tiledraw';
import type { EntityView, PlayerView } from './view';

export function buildEntityTextures(scene: Phaser.Scene) {
  makeTex(scene, 'ob_star', { w: 44, h: 44 }, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(1, 3, 17, 15, 0, 0, 7); c.fill();
    drawOutlined(c, () => starPath(c, 0, 0, 18, 8), vgrad(c, -18, 18, '#FFE97A', '#F2A60D'), { lw: 3 });
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(-5, -6, 3.5, 2, -0.6, 0, 7); c.fill();
  });
  makeTex(scene, 'ob_halo', { w: 100, h: 100 }, (c) => {
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 46); g.addColorStop(0, 'rgba(255,240,160,0.8)'); g.addColorStop(1, 'rgba(255,220,100,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 46, 0, 7); c.fill();
  });
  makeTex(scene, 'ob_pole', { w: 16, h: 80, ox: 8, oy: 80 }, (c) => {
    drawOutlined(c, () => rr(c, -3, -76, 6, 76, 3), vgrad(c, -76, 0, '#E8EEF2', '#8D9BA5'), { lw: 2.6 });
    drawOutlined(c, circle(c, 0, -77, 5), '#FFD23F', { lw: 2.4 });
    drawOutlined(c, () => rr(c, -8, -4, 16, 7, 3), '#7D8B95', { lw: 2.4 });
  });
  const pennant = (key: string, fill: string, fill2: string) => makeTex(scene, key, { w: 56, h: 40, ox: 0, oy: 20 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(0, -18); c.quadraticCurveTo(24, -24, 50, -8); c.lineTo(36, 2); c.lineTo(50, 12); c.quadraticCurveTo(24, 18, 0, 14); c.closePath(); }, vgrad(c, -18, 14, fill, fill2), { lw: 2.8 });
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(4, -14, 28, 3);
  });
  pennant('ob_flag_off', '#C9C0B4', '#968C80');
  pennant('ob_flag_on', '#FF6A5A', '#C62E22');
  makeTex(scene, 'ob_goalflag', { w: 80, h: 56, ox: 0, oy: 28 }, (c) => {
    c.save(); c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(34, -34, 74, -14); c.lineTo(74, 18); c.quadraticCurveTo(34, 30, 0, 24); c.closePath(); c.clip();
    c.fillStyle = '#FFFFFF'; c.fillRect(0, -40, 80, 80);
    c.fillStyle = INK; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2 === 0) c.fillRect(x * 13, -34 + y * 12, 13, 12);
    c.restore();
    c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(34, -34, 74, -14); c.lineTo(74, 18); c.quadraticCurveTo(34, 30, 0, 24); c.closePath(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  });
  makeTex(scene, 'ob_ring', { w: 44, h: 44 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.arc(0, 0, 14, 0, 7); }, 'rgba(0,0,0,0)', { lw: 9.5 });
    c.strokeStyle = '#D9DEE2'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 14, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    drawOutlined(c, () => rr(c, -5, -22, 10, 10, 3), '#7D8B95', { lw: 2.4 });
  });
  // Elastic ring (campaign dynamic 11): the same ring in orange rubber with a coiled spring up to its hook, so it reads as "stretches" from across the screen.
  makeTex(scene, 'ob_ring_bungee', { w: 44, h: 52, oy: 26 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.arc(0, 4, 14, 0, 7); }, 'rgba(0,0,0,0)', { lw: 9.5 });
    c.strokeStyle = '#FF9A2E'; c.lineWidth = 5; c.beginPath(); c.arc(0, 4, 14, 0, 7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 4, 14, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 5.4; c.beginPath(); c.moveTo(0, -10); for (let i = 0; i < 4; i++) { c.lineTo(i % 2 ? -5 : 5, -14 - i * 3); } c.stroke();
    c.strokeStyle = '#D9DEE2'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, -10); for (let i = 0; i < 4; i++) { c.lineTo(i % 2 ? -5 : 5, -14 - i * 3); } c.stroke();
    drawOutlined(c, () => rr(c, -5, -26, 10, 7, 3), '#7D8B95', { lw: 2.4 });
  });
  makeTex(scene, 'ob_box', { w: 52, h: 52 }, (c) => {
    drawOutlined(c, () => rr(c, -22, -22, 44, 44, 5), vgrad(c, -22, 22, '#E2A961', '#B57A3A'), { lw: 3 });
    c.strokeStyle = 'rgba(80,40,10,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-18, -18); c.lineTo(18, 18); c.moveTo(18, -18); c.lineTo(-18, 18); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 2.6; c.strokeRect(-16, -16, 32, 32);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-18, -19, 22, 2.4);
  });
  makeTex(scene, 'ob_heavy', { w: 52, h: 52 }, (c) => {
    drawOutlined(c, () => rr(c, -22, -22, 44, 44, 5), vgrad(c, -22, 22, '#8F9AA3', '#59636B'), { lw: 3 });
    c.fillStyle = '#3F474D'; for (const [x, y] of [[-22, -22], [10, -22], [-22, 10], [10, 10]] as const) { c.fillRect(x, y, 12, 12); }
    c.strokeStyle = INK; c.lineWidth = 2.4; for (const [x, y] of [[-22, -22], [10, -22], [-22, 10], [10, 10]] as const) c.strokeRect(x, y, 12, 12);
    c.strokeStyle = '#FFC21A'; c.lineWidth = 4.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(9, -9); c.lineTo(-9, 9); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, -19); c.lineTo(8, -19); c.stroke();
  });
  makeTex(scene, 'ob_key', { w: 44, h: 44 }, (c) => {
    c.rotate(-0.6);
    drawOutlined(c, circle(c, -8, 0, 8), '#FFD23F', { lw: 3 });
    c.fillStyle = INK; c.beginPath(); c.arc(-8, 0, 3, 0, 7); c.fill();
    drawOutlined(c, () => rr(c, -1, -3, 22, 6, 2), '#FFD23F', { lw: 3 });
    drawOutlined(c, () => rr(c, 13, 2, 4, 8, 1.5), '#FFD23F', { lw: 2.4 });
    drawOutlined(c, () => rr(c, 7, 2, 4, 6, 1.5), '#FFD23F', { lw: 2.4 });
  });
  makeTex(scene, 'ob_rock', { w: 52, h: 52 }, (c) => {
    drawOutlined(c, () => { c.beginPath(); c.moveTo(-20, 8); c.lineTo(-16, -12); c.lineTo(-2, -22); c.lineTo(16, -16); c.lineTo(22, 4); c.lineTo(10, 20); c.lineTo(-12, 18); c.closePath(); }, vgrad(c, -22, 20, '#6B6163', '#3A3234'), { lw: 3 });
    c.strokeStyle = '#FF5A1F'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -8); c.lineTo(2, 0); c.lineTo(-2, 8); c.stroke();
  });
  makeTex(scene, 'ob_saw', { w: 60, h: 60 }, (c) => {
    c.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 28; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
    c.fillStyle = vgrad(c, -28, 28, '#E8EEF2', '#8D9BA5'); c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    drawOutlined(c, circle(c, 0, 0, 6), '#5E6B78', { lw: 2.6 });
  });
}

const at = (scene: Phaser.Scene, key: string) => { const t = texSize(key)!; return scene.add.image(0, 0, key).setOrigin(t.ox / t.w, t.oy / t.h).setScale(1 / R); };

interface Sprite { kind: string; objs: Phaser.GameObjects.GameObject[]; gfx?: Phaser.GameObjects.Graphics; text?: Phaser.GameObjects.Text; sig: string; shown: number; seen: boolean; flag?: Phaser.GameObjects.Image; halo?: Phaser.GameObjects.Image }

export class EntityLayer {
  private sprites = new Map<string, Sprite>();
  private t = 0;
  constructor(private scene: Phaser.Scene, private layer: Phaser.GameObjects.Layer, private behind: Phaser.GameObjects.Layer, private biome: Biome) {}

  private make(e: EntityView): Sprite {
    const s = this.scene, L = this.layer;
    const sp: Sprite = { kind: e.kind, objs: [], sig: '', shown: e.on ? 1 : 0, seen: true };
    const add = <T extends Phaser.GameObjects.GameObject>(o: T, layer = L): T => { layer.add(o); sp.objs.push(o); return o; };
    switch (e.kind) {
      case 'star': sp.halo = add(at(s, 'ob_halo').setAlpha(0.7)); sp.flag = add(at(s, 'ob_star')); break;
      case 'checkpoint': add(at(s, 'ob_pole')); sp.flag = add(at(s, 'ob_flag_off')); sp.halo = add(at(s, 'ob_flag_on').setAlpha(0)); break;
      case 'goal': sp.halo = add(at(s, 'ob_halo').setTint(0xfff2b0).setScale(2.6 / R)); add(at(s, 'ob_pole').setScale(1.3 / R)); sp.flag = add(at(s, 'ob_goalflag').setScale(1.15 / R)); break;
      case 'ring': sp.halo = add(at(s, 'ob_halo').setAlpha(0)); sp.flag = add(at(s, e.label === 'elastic' ? 'ob_ring_bungee' : 'ob_ring')); break;
      case 'box': sp.flag = add(at(s, 'ob_box')); break;
      case 'heavyBox': sp.flag = add(at(s, 'ob_heavy')); break;
      case 'key': sp.halo = add(at(s, 'ob_halo').setScale(0.6 / R)); sp.flag = add(at(s, 'ob_key')); break;
      case 'rock': sp.flag = add(at(s, 'ob_rock')); break;
      case 'saw': sp.flag = add(at(s, 'ob_saw')); break;
      default: sp.gfx = add(s.add.graphics(), e.kind === 'ladder' ? this.behind : L); break;
    }
    if (e.kind === 'plate' || e.kind === 'heavyBox' || e.kind === 'box') {
      sp.text = add(s.add.text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold', fontSize: '20px', color: C.cream, stroke: INK, strokeThickness: 5, resolution: 2 }).setOrigin(0.5, 1));
    }
    return sp;
  }

  update(dt: number, ents: readonly EntityView[], players: readonly PlayerView[]) {
    this.t += dt;
    const pal = PALETTES[this.biome];
    for (const sp of this.sprites.values()) sp.seen = false;
    for (const e of ents) {
      let sp = this.sprites.get(e.id);
      if (!sp) { sp = this.make(e); this.sprites.set(e.id, sp); }
      sp.seen = true;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2, tt = this.t;
      sp.shown += ((e.on ? 1 : 0) - sp.shown) * Math.min(1, dt * 9);
      switch (e.kind) {
        case 'star': {
          sp.objs.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(!e.on));
          const bob = Math.sin(tt * 3 + cx * 0.05) * 3;
          sp.flag!.setPosition(cx, cy + bob).setRotation(Math.sin(tt * 2 + cx) * 0.12).setScale((1 / R) * (1 + Math.sin(tt * 4 + cx) * 0.05));
          sp.halo!.setPosition(cx, cy + bob).setAlpha(0.45 + Math.sin(tt * 3 + cx) * 0.2);
          break;
        }
        case 'checkpoint': {
          const base = e.y + e.h; // pole stands on the cell's floor
          const [pole, flag, flagOn] = sp.objs as Phaser.GameObjects.Image[];
          pole!.setPosition(cx, base); pole!.setScale(0.8 / R);
          const up = 0.35 + 0.65 * sp.shown; const fy = base - 62 * 0.8 * up;
          const wob = Math.sin(tt * 5 + cx) * 0.05;
          flag!.setPosition(cx + 2, fy + 4).setRotation(wob).setAlpha(1 - sp.shown).setScale(0.75 / R);
          flagOn!.setPosition(cx + 2, fy + 4).setRotation(wob).setAlpha(sp.shown).setScale(0.75 / R);
          break;
        }
        case 'goal': {
          const base = e.y + e.h;
          const [halo, pole, flag] = sp.objs as Phaser.GameObjects.Image[];
          halo!.setPosition(cx, base - 40).setAlpha((e.on ? 0.95 : 0.4) + Math.sin(tt * 3) * 0.12);
          pole!.setPosition(cx, base).setScale(1.3 / R * 1.0);
          flag!.setPosition(cx + 3, base - 98).setRotation(Math.sin(tt * 4) * 0.04).setScale((1.0 + Math.sin(tt * 4.4) * 0.03) / R, 1 / R);
          break;
        }
        case 'ring': {
          sp.flag!.setPosition(cx, cy).setRotation(e.on ? tt * 1.5 : 0);
          sp.halo!.setPosition(cx, cy).setAlpha(sp.shown * 0.8).setScale(0.9 / R);
          break;
        }
        case 'box': case 'heavyBox': {
          sp.flag!.setPosition(cx, cy).setScale((e.w / 48) / R, (e.h / 48) / R);
          sp.flag!.setAlpha(e.holder >= 0 ? 0.92 : 1);
          if (sp.text) sp.text.setText(e.label).setPosition(cx, e.y - 2).setVisible(e.label !== '');
          break;
        }
        case 'key': { const bob = Math.sin(tt * 3.4 + cx) * 3; sp.objs.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(!e.on || e.holder >= 0)); sp.flag!.setPosition(cx, cy + bob); sp.halo!.setPosition(cx, cy + bob).setAlpha(0.55); break; }
        case 'rock': { sp.flag!.setPosition(cx, cy).setRotation(tt * 3); break; }
        case 'saw': { sp.flag!.setPosition(cx, cy).setRotation(tt * 9).setScale((Math.max(e.w, e.h) / 56) / R); break; }
        case 'plate': this.drawPlate(sp, e); break;
        case 'lever': this.drawLever(sp, e); break;
        case 'gate': this.drawGate(sp, e, pal.wood); break;
        case 'ladder': this.drawLadderEnt(sp, e); break;
        case 'mover': case 'balance': this.drawMover(sp, e, pal.wood, pal.woodDark); break;
        case 'crumble': this.drawCrumbleEnt(sp, e); break;
        case 'target': this.drawTarget(sp, e); break;
        case 'enemy': this.drawEnemy(sp, e); break;
        case 'pickaxe': this.drawPickaxe(sp, e); break;
        case 'lantern': this.drawLantern(sp, e); break;
        case 'sinker': this.drawSinker(sp, e); break;
        case 'geyser': this.drawGeyser(sp, e); break;
      }
    }
    for (const [id, sp] of this.sprites) if (!sp.seen) { sp.objs.forEach((o) => o.destroy()); this.sprites.delete(id); }
    void players;
  }

  private redraw(sp: Sprite, sig: string): Phaser.GameObjects.Graphics | null {
    if (!sp.gfx || sp.sig === sig) return null;
    sp.sig = sig; sp.gfx.clear();
    return sp.gfx;
  }

  private drawPlate(sp: Sprite, e: EntityView) {
    const sink = Math.round(e.value * 6) / 6 || (e.on ? 1 : 0);
    const sig = `${e.x}|${e.y}|${e.w}|${e.on}|${sink}`;
    const g = this.redraw(sp, sig);
    if (sp.text) sp.text.setText(e.label).setPosition(e.x + e.w / 2, e.y + e.h - 10 - (e.on ? 3 : 0)).setVisible(e.label !== '');
    if (!g) return;
    const col = hexToInt(tagColor(e.tag)), y = e.y + e.h - 10 + sink * 5;
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(e.x + 2, e.y + e.h - 6, e.w - 4, 6, 2); // base rail
    g.fillStyle(0x59636b, 1); g.fillRoundedRect(e.x + 5, e.y + e.h - 5, e.w - 10, 3, 1);
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(e.x + 4, y - 2, e.w - 8, 11, 4);
    g.fillStyle(e.on ? 0xfff2b0 : col, 1); g.fillRoundedRect(e.x + 7, y, e.w - 14, 7, 3);
    g.fillStyle(0xffffff, 0.45); g.fillRect(e.x + 11, y + 1, e.w - 26, 1.8);
  }
  private drawLever(sp: Sprite, e: EntityView) {
    const sig = `${e.x}|${e.y}|${e.on}`;
    const g = this.redraw(sp, sig); if (!g) return;
    const col = hexToInt(tagColor(e.tag)), cx = e.x + e.w / 2, by = e.y + e.h;
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(cx - 17, by - 12, 34, 12, 4);
    g.fillStyle(0x7d8b95, 1); g.fillRoundedRect(cx - 14, by - 10, 28, 8, 3);
    const ang = e.on ? 0.65 : -0.65, hx = cx + Math.sin(ang) * 30, hy = by - 10 - Math.cos(ang) * 30;
    g.lineStyle(9, 0x2b1b17, 1); g.lineBetween(cx, by - 10, hx, hy);
    g.lineStyle(5, 0xd9dee2, 1); g.lineBetween(cx, by - 10, hx, hy);
    g.fillStyle(0x2b1b17, 1); g.fillCircle(hx, hy, 8.5); g.fillStyle(col, 1); g.fillCircle(hx, hy, 6);
  }
  private drawGate(sp: Sprite, e: EntityView, wood: string) {
    const open = Math.round(sp.shown * 8) / 8;
    const sig = `${e.x}|${e.y}|${e.w}|${e.h}|${open}`;
    const g = this.redraw(sp, sig); if (!g) return;
    const col = hexToInt(tagColor(e.tag));
    const h = e.h * (1 - open * 0.88);
    if (h < 4) return;
    const n = Math.max(2, Math.round(e.w / 16));
    for (let i = 0; i < n; i++) {
      const bx = e.x + (i + 0.5) * (e.w / n);
      g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(bx - 5.5, e.y, 11, h, 3);
      g.fillStyle(0xaeb8c0, 1); g.fillRoundedRect(bx - 3, e.y + 1.5, 6, h - 3, 2);
      g.fillStyle(0xffffff, 0.45); g.fillRect(bx - 2.5, e.y + 3, 1.8, h - 8);
    }
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(e.x - 2, e.y - 4, e.w + 4, 12, 3);
    g.fillStyle(col, 1); g.fillRoundedRect(e.x + 1, e.y - 1.5, e.w - 2, 7, 2);
    void wood;
  }
  private drawLadderEnt(sp: Sprite, e: EntityView) {
    const a = Math.round(sp.shown * 8) / 8;
    const sig = `${e.x}|${e.y}|${e.h}|${a}`;
    const g = this.redraw(sp, sig); if (!g) return;
    // ladder art is the canvas one: draw rails and rungs directly with Graphics to avoid a texture per height
    const alpha = 0.16 + a * 0.84;
    const x0 = e.x + e.w / 2 - 24;
    const wood = hexToInt(PALETTES[this.biome].wood);
    g.lineStyle(9, 0x2b1b17, alpha); g.lineBetween(x0 + 11, e.y, x0 + 11, e.y + e.h); g.lineBetween(x0 + 37, e.y, x0 + 37, e.y + e.h);
    g.lineStyle(4, wood, alpha); g.lineBetween(x0 + 11, e.y, x0 + 11, e.y + e.h); g.lineBetween(x0 + 37, e.y, x0 + 37, e.y + e.h);
    for (let yy = e.y + 8; yy < e.y + e.h; yy += 16) { g.lineStyle(5.5, 0x2b1b17, alpha); g.lineBetween(x0 + 11, yy, x0 + 37, yy); g.lineStyle(2.6, 0xe6b980, alpha); g.lineBetween(x0 + 11, yy, x0 + 37, yy); }
    void drawLadder;
  }
  private drawMover(sp: Sprite, e: EntityView, wood: string, woodDark: string) {
    const sig = `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${e.w}|${e.h}`;
    const g = this.redraw(sp, sig); if (!g) return;
    const w = hexToInt(wood), wd = hexToInt(woodDark), th = Math.max(12, Math.min(e.h, 16));
    if (e.kind === 'balance') { // chains up to the pulley
      g.lineStyle(3.5, 0x2b1b17, 1); g.lineBetween(e.x + 6, e.y, e.x + 6, e.y - 150); g.lineBetween(e.x + e.w - 6, e.y, e.x + e.w - 6, e.y - 150);
      g.lineStyle(1.6, 0x9aa6ae, 1); g.lineBetween(e.x + 6, e.y, e.x + 6, e.y - 150); g.lineBetween(e.x + e.w - 6, e.y, e.x + e.w - 6, e.y - 150);
    }
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(e.x - 1.5, e.y - 1.5, e.w + 3, th + 3, 6);
    g.fillStyle(w, 1); g.fillRoundedRect(e.x + 1, e.y + 1, e.w - 2, th - 2, 5);
    g.fillStyle(wd, 1); g.fillRect(e.x + 3, e.y + th - 5, e.w - 6, 3);
    g.fillStyle(0xffffff, 0.3); g.fillRect(e.x + 6, e.y + 3, e.w - 12, 2);
    g.lineStyle(2, wd, 0.7); for (let x = e.x + 24; x < e.x + e.w - 4; x += 24) g.lineBetween(x, e.y + 1, x, e.y + th - 1);
    g.fillStyle(0x2b1b17, 1); g.fillCircle(e.x + 8, e.y + th / 2, 1.8); g.fillCircle(e.x + e.w - 8, e.y + th / 2, 1.8);
  }
  private drawCrumbleEnt(sp: Sprite, e: EntityView) {
    // shaking / falling copy of the tile. Cheap: redraw as a Graphics block (the baked tile hides underneath until the grid clears it)
    const sh = e.on ? 0 : e.value * 2.4 * Math.sin(this.t * 60);
    const fade = e.on ? 1 - e.value : 1;
    const sig = `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${sh.toFixed(1)}|${fade.toFixed(2)}`;
    const g = this.redraw(sp, sig); if (!g) return;
    if (e.value <= 0 && !e.on) return;
    const pal = PALETTES[this.biome];
    g.fillStyle(0x2b1b17, fade); g.fillRoundedRect(e.x + sh - 1, e.y - 1, e.w + 2, e.h + 2, 5);
    g.fillStyle(hexToInt(pal.wood), fade); g.fillRoundedRect(e.x + sh + 2, e.y + 2, e.w - 4, e.h - 4, 4);
    g.lineStyle(2.4, 0x2b1b17, fade); g.lineBetween(e.x + sh + 12, e.y + 2, e.x + sh + 18, e.y + 16); g.lineBetween(e.x + sh + 18, e.y + 16, e.x + sh + 11, e.y + 28);
    void ({} as CellCtx); void drawCrumble; void TILE;
  }

  // ---- campaign A5 (dynamics 5, 6, 9): Graphics only, redrawn when their signature changes
  // Diana: bullseye in the colour of its gate's letter; lit with a clock arc (the seconds left of the open gate) while it is on.
  private drawTarget(sp: Sprite, e: EntityView) {
    const clock = Math.round(e.value * 24) / 24;
    const g = this.redraw(sp, `${e.x}|${e.y}|${e.w}|${e.h}|${e.on}|${clock}`); if (!g) return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = Math.min(e.w, e.h) / 2 - 4, col = hexToInt(tagColor(e.tag));
    g.fillStyle(0x2b1b17, 1); g.fillCircle(cx, cy, r + 4);
    g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, r);
    g.fillStyle(e.on ? 0xfff2b0 : col, 1); g.fillCircle(cx, cy, r * 0.72);
    g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, r * 0.46);
    g.fillStyle(e.on ? 0xffc21a : 0xe63b2e, 1); g.fillCircle(cx, cy, r * 0.22);
    if (e.on && clock > 0) { g.lineStyle(5, 0xfff2b0, 1); g.beginPath(); g.arc(cx, cy, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clock, false); g.strokePath(); }
  }
  // Escarabajo: red-brown dome with six legs that shuffle; stunned = grey, eyes crossed and three stars circling over it.
  private drawEnemy(sp: Sprite, e: EntityView) {
    const t = this.t, shuffle = e.on ? 0 : Math.floor(t * 8) % 2, spin = e.on ? Math.floor(t * 12) : 0;
    const g = this.redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${e.on}|${e.value}|${shuffle}|${spin}`); if (!g) return;
    const cx = e.x + e.w / 2, base = e.y + e.h, f = e.value > 0.5 ? 1 : -1;
    const body = e.on ? 0x9aa7b0 : 0xc0562f, shade = e.on ? 0x77848d : 0x8f3a1e;
    g.lineStyle(3, 0x2b1b17, 1);
    for (let i = 0; i < 3; i++) { const lx = cx - 13 + i * 13, sw = (shuffle ^ (i & 1)) ? 4 : -4; g.lineBetween(lx, base - 9, lx + sw, base); }
    g.fillStyle(0x2b1b17, 1); g.fillEllipse(cx, base - 13, e.w + 4, 28);
    g.fillStyle(body, 1); g.fillEllipse(cx, base - 14, e.w - 2, 24);
    g.fillStyle(shade, 1); g.fillEllipse(cx - f * 4, base - 11, e.w - 14, 12);
    g.lineStyle(2, 0x2b1b17, 0.8); g.lineBetween(cx - f * 2, base - 26, cx - f * 2, base - 3);
    g.fillStyle(0xffffff, 0.45); g.fillEllipse(cx + f * 6, base - 22, 10, 4);
    const hx = cx + f * (e.w / 2 - 3), hy = base - 15;
    g.fillStyle(0x2b1b17, 1); g.fillCircle(hx, hy, 9); g.fillStyle(body, 1); g.fillCircle(hx, hy, 7);
    if (e.on) { g.lineStyle(2, 0x2b1b17, 1); g.lineBetween(hx - 3, hy - 3, hx + 3, hy + 3); g.lineBetween(hx - 3, hy + 3, hx + 3, hy - 3); for (let k = 0; k < 3; k++) { const a = t * 5 + k * 2.1; g.fillStyle(0xffd23f, 1); g.fillCircle(cx + Math.cos(a) * 14, base - 36 + Math.sin(a) * 4, 3); } }
    else { g.fillStyle(0xffffff, 1); g.fillCircle(hx + f * 2, hy - 1, 3); g.fillStyle(0x2b1b17, 1); g.fillCircle(hx + f * 3, hy - 1, 1.6); }
  }
  // Piolet: a pick with a steel crescent head; on the floor it bobs with a halo, in a player's hands it is smaller and sits over the head.
  private drawPickaxe(sp: Sprite, e: EntityView) {
    const bob = e.on ? 0 : Math.round(Math.sin(this.t * 3.4 + e.x) * 3), k = e.on ? 0.75 : 1;
    const g = this.redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${bob}|${e.on}`); if (!g) return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2 + bob;
    if (!e.on) { g.fillStyle(0xc8f0ff, 0.35); g.fillCircle(cx, cy, 20); }
    g.lineStyle(8 * k, 0x2b1b17, 1); g.lineBetween(cx - 12 * k, cy + 15 * k, cx + 9 * k, cy - 11 * k);
    g.lineStyle(4.5 * k, 0xb57a3a, 1); g.lineBetween(cx - 12 * k, cy + 15 * k, cx + 9 * k, cy - 11 * k);
    g.lineStyle(9 * k, 0x2b1b17, 1); g.beginPath(); g.moveTo(cx - 8 * k, cy - 16 * k); g.lineTo(cx + 8 * k, cy - 18 * k); g.lineTo(cx + 22 * k, cy - 6 * k); g.strokePath();
    g.lineStyle(5 * k, 0xcfe9f5, 1); g.beginPath(); g.moveTo(cx - 8 * k, cy - 16 * k); g.lineTo(cx + 8 * k, cy - 18 * k); g.lineTo(cx + 22 * k, cy - 6 * k); g.strokePath();
  }

  // ---- campaign A6 (dynamics 10 and 12): Graphics only, redrawn when their signature changes
  // Farol: a brass lantern with a warm glass; on the floor it bobs with a big halo, in a player's hands it is smaller and sits over the head.
  private drawLantern(sp: Sprite, e: EntityView) {
    const bob = e.on ? 0 : Math.round(Math.sin(this.t * 3 + e.x) * 3), k = e.on ? 0.8 : 1, fl = Math.round((0.5 + 0.5 * Math.sin(this.t * 9 + e.x)) * 3);
    const g = this.redraw(sp, `${e.x.toFixed(0)}|${e.y.toFixed(0)}|${bob}|${e.on}|${fl}`); if (!g) return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2 + bob;
    g.fillStyle(0xffd27a, 0.18 + fl * 0.03); g.fillCircle(cx, cy, 30 * k);
    g.lineStyle(4, 0x2b1b17, 1); g.beginPath(); g.arc(cx, cy - 16 * k, 8 * k, Math.PI, 0, false); g.strokePath(); // handle
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(cx - 12 * k, cy - 16 * k, 24 * k, 7 * k, 3); g.fillRoundedRect(cx - 12 * k, cy + 10 * k, 24 * k, 7 * k, 3);
    g.fillStyle(0xc98a2b, 1); g.fillRoundedRect(cx - 10 * k, cy - 15 * k, 20 * k, 5 * k, 2); g.fillRoundedRect(cx - 10 * k, cy + 11 * k, 20 * k, 5 * k, 2);
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(cx - 11 * k, cy - 10 * k, 22 * k, 21 * k, 5);
    g.fillStyle(0xfff0b0, 1); g.fillRoundedRect(cx - 8.5 * k, cy - 8 * k, 17 * k, 17 * k, 4);
    g.fillStyle(0xffb62e, 1); g.fillCircle(cx, cy + 2 * k, (4.5 + fl * 0.5) * k);
    g.fillStyle(0xffffff, 0.7); g.fillRect(cx - 6 * k, cy - 6 * k, 2.4 * k, 9 * k);
  }
  // Roca hundible: a grey slab with a darker underside and waterline streaks; it darkens and drips as it sinks.
  private drawSinker(sp: Sprite, e: EntityView) {
    const sink = Math.round(e.value * 8) / 8;
    const g = this.redraw(sp, `${e.x.toFixed(1)}|${e.y.toFixed(1)}|${e.w}|${sink}`); if (!g) return;
    const th = 22, top = (Math.round(0x9a + (0x6f - 0x9a) * sink) << 16) | (Math.round(0xa3 + (0x77 - 0xa3) * sink) << 8) | Math.round(0xa8 + (0x7c - 0xa8) * sink);
    g.fillStyle(0x2b1b17, 1); g.fillRoundedRect(e.x - 2, e.y - 2, e.w + 4, th + 4, 9);
    g.fillStyle(top, 1); g.fillRoundedRect(e.x + 1, e.y + 1, e.w - 2, th - 2, 8);
    g.fillStyle(0x59636b, 1); g.fillRoundedRect(e.x + 6, e.y + th - 9, e.w - 12, 6, 3);
    g.fillStyle(0xffffff, 0.35); g.fillRect(e.x + 10, e.y + 4, e.w - 26, 3);
    g.lineStyle(2, 0x3a4147, 0.8); for (let x = e.x + 18; x < e.x + e.w - 6; x += 26) g.lineBetween(x, e.y + 8, x + 5, e.y + th - 4);
    if (sink > 0) { g.fillStyle(0x9be0ff, 0.65); for (let i = 0; i < 3; i++) g.fillCircle(e.x + 12 + i * (e.w - 24) / 2, e.y - 4 - i % 2 * 4, 3); } // spray while it goes down
  }
  // Geiser: a stone mouth in the floor. Calm: a faint ring; bubbling (value 0.5): bubbles climb; erupting (value 1): a water column with spray.
  private drawGeyser(sp: Sprite, e: EntityView) {
    const ph = e.value >= 1 ? 2 : e.value > 0 ? 1 : 0, tt = Math.floor(this.t * 12);
    const g = this.redraw(sp, `${e.x}|${e.y}|${ph}|${ph ? tt : 0}`); if (!g) return;
    const cx = e.x + e.w / 2, base = e.y + e.h, w = e.w;
    g.fillStyle(0x2b1b17, 1); g.fillEllipse(cx, base - 3, w + 10, 20);
    g.fillStyle(0x59636b, 1); g.fillEllipse(cx, base - 4, w + 2, 15);
    g.fillStyle(0x1d2a33, 1); g.fillEllipse(cx, base - 5, w - 12, 9);
    g.fillStyle(ph === 2 ? 0xdff6ff : 0x6fb3d6, 1); g.fillEllipse(cx, base - 5, w - 20, 5);
    if (ph === 1) for (let i = 0; i < 5; i++) { const u = ((tt * 0.13 + i * 0.21) % 1), bx = cx + Math.sin(i * 2.3 + tt * 0.3) * (w / 3); g.fillStyle(0xbfe9ff, 0.85 * (1 - u)); g.fillCircle(bx, base - 8 - u * 46, 3 + (i % 2) * 1.5); }
    if (ph === 2) {
      const h = 2.6 * TILE;
      g.fillStyle(0x9be0ff, 0.8); g.fillRoundedRect(cx - 19, base - h, 38, h - 4, 15);
      g.fillStyle(0xffffff, 0.75); g.fillRoundedRect(cx - 8, base - h + 4, 10, h - 14, 5);
      for (let i = 0; i < 7; i++) { const a = (tt * 0.37 + i * 0.9) % 1; g.fillStyle(0xdff6ff, 1 - a); g.fillCircle(cx + (i % 2 ? 1 : -1) * (12 + a * 26), base - h + 10 + a * 34, 4 - a * 2); }
    }
  }

  destroy() { for (const sp of this.sprites.values()) sp.objs.forEach((o) => o.destroy()); this.sprites.clear(); }
}

// World-space hint signs (LevelDef.hints): a wooden board that fades in when someone is within 7 tiles.
export class HintSigns {
  private items: { x: number; y: number; box: Phaser.GameObjects.Graphics; txt: Phaser.GameObjects.Text; a: number }[] = [];
  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, hints: readonly { x: number; y: number; text: string }[]) {
    for (const h of hints) {
      const txt = scene.add.text((h.x + 0.5) * TILE, (h.y - 1.2) * TILE, h.text, { fontFamily: FONT, fontStyle: 'bold', fontSize: '26px', color: C.ink, align: 'center', resolution: 2, wordWrap: { width: 330 } }).setOrigin(0.5, 1);
      const box = scene.add.graphics();
      const w = txt.width + 36, hh = txt.height + 22, x = txt.x - w / 2, y = txt.y - hh + 10;
      box.fillStyle(0x2b1b17, 1); box.fillRoundedRect(x - 3, y - 3, w + 6, hh + 6, 16);
      box.fillStyle(0xfff4e0, 1); box.fillRoundedRect(x, y, w, hh, 13);
      box.fillTriangle(txt.x - 12, y + hh - 1, txt.x + 12, y + hh - 1, txt.x, y + hh + 16);
      box.lineStyle(3, 0x2b1b17, 1); box.lineBetween(txt.x - 12, y + hh + 1, txt.x, y + hh + 17); box.lineBetween(txt.x + 12, y + hh + 1, txt.x, y + hh + 17);
      txt.setPosition(txt.x, y + hh - 11);
      layer.add([box, txt]);
      box.setAlpha(0); txt.setAlpha(0);
      this.items.push({ x: (h.x + 0.5) * TILE, y: (h.y + 0.5) * TILE, box, txt, a: 0 });
    }
  }
  update(dt: number, players: readonly { x: number; y: number }[]) {
    for (const it of this.items) {
      const near = players.some((p) => Math.hypot(p.x - it.x, p.y - it.y) < 7 * TILE);
      it.a += ((near ? 1 : 0) - it.a) * Math.min(1, dt * 6);
      it.box.setAlpha(it.a); it.txt.setAlpha(it.a);
    }
  }
  destroy() { for (const it of this.items) { it.box.destroy(); it.txt.destroy(); } }
}
