// The entity layer: one sprite per WorldView entity, created on first sight and updated every frame.
import { drawCrumbleEnt, drawLadderEnt, drawGate, drawLever, drawMover, drawPlate, drawTarget } from './draw-fixtures';
import { drawEnemy, drawGeyser, drawLantern, drawPickaxe, drawSinker } from './draw-creatures';
import { at, type Sprite } from './sprite';
import type Phaser from 'phaser';
import type { Biome } from '../../../index';
import { C, FONT } from '@pichi/screen-kit/art/tokens';
import { R } from '@pichi/screen-kit/art/gfx';
import { INK, PALETTES } from '../biome';
import type { EntityView, PlayerView } from '../view';

export class EntityLayer {
  private sprites = new Map<string, Sprite>();
  private t = 0;
  constructor(
    private scene: Phaser.Scene,
    private layer: Phaser.GameObjects.Layer,
    private behind: Phaser.GameObjects.Layer,
    private biome: Biome,
  ) {}

  private make(e: EntityView): Sprite {
    const s = this.scene,
      L = this.layer;
    const sp: Sprite = { kind: e.kind, objs: [], sig: '', shown: e.on ? 1 : 0, seen: true };
    const add = <T extends Phaser.GameObjects.GameObject>(o: T, layer = L): T => {
      layer.add(o);
      sp.objs.push(o);
      return o;
    };
    switch (e.kind) {
      case 'star':
        sp.halo = add(at(s, 'ob_halo').setAlpha(0.7));
        sp.flag = add(at(s, 'ob_star'));
        break;
      case 'checkpoint':
        add(at(s, 'ob_pole'));
        sp.flag = add(at(s, 'ob_flag_off'));
        sp.halo = add(at(s, 'ob_flag_on').setAlpha(0));
        break;
      case 'goal':
        sp.halo = add(
          at(s, 'ob_halo')
            .setTint(0xfff2b0)
            .setScale(2.6 / R),
        );
        add(at(s, 'ob_pole').setScale(1.3 / R));
        sp.flag = add(at(s, 'ob_goalflag').setScale(1.15 / R));
        break;
      case 'ring':
        sp.halo = add(at(s, 'ob_halo').setAlpha(0));
        sp.flag = add(at(s, e.label === 'elastic' ? 'ob_ring_bungee' : 'ob_ring'));
        break;
      case 'box':
        sp.flag = add(at(s, 'ob_box'));
        break;
      case 'heavyBox':
        sp.flag = add(at(s, 'ob_heavy'));
        break;
      case 'key':
        sp.halo = add(at(s, 'ob_halo').setScale(0.6 / R));
        sp.flag = add(at(s, 'ob_key'));
        break;
      case 'rock':
        sp.flag = add(at(s, 'ob_rock'));
        break;
      case 'saw':
        sp.flag = add(at(s, 'ob_saw'));
        break;
      default:
        sp.gfx = add(s.add.graphics(), e.kind === 'ladder' ? this.behind : L);
        break;
    }
    if (e.kind === 'plate' || e.kind === 'heavyBox' || e.kind === 'box') {
      sp.text = add(
        s.add
          .text(0, 0, '', {
            fontFamily: FONT,
            fontStyle: 'bold',
            fontSize: '20px',
            color: C.cream,
            stroke: INK,
            strokeThickness: 5,
            resolution: 2,
          })
          .setOrigin(0.5, 1),
      );
    }
    return sp;
  }

  update(dt: number, ents: readonly EntityView[], players: readonly PlayerView[]) {
    this.t += dt;
    const pal = PALETTES[this.biome];
    for (const sp of this.sprites.values()) sp.seen = false;
    for (const e of ents) {
      let sp = this.sprites.get(e.id);
      if (!sp) {
        sp = this.make(e);
        this.sprites.set(e.id, sp);
      }
      sp.seen = true;
      const cx = e.x + e.w / 2,
        cy = e.y + e.h / 2,
        tt = this.t;
      sp.shown += ((e.on ? 1 : 0) - sp.shown) * Math.min(1, dt * 9);
      switch (e.kind) {
        case 'star': {
          sp.objs.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(!e.on));
          const bob = Math.sin(tt * 3 + cx * 0.05) * 3;
          sp.flag!.setPosition(cx, cy + bob)
            .setRotation(Math.sin(tt * 2 + cx) * 0.12)
            .setScale((1 / R) * (1 + Math.sin(tt * 4 + cx) * 0.05));
          sp.halo!.setPosition(cx, cy + bob).setAlpha(0.45 + Math.sin(tt * 3 + cx) * 0.2);
          break;
        }
        case 'checkpoint': {
          const base = e.y + e.h; // pole stands on the cell's floor
          const [pole, flag, flagOn] = sp.objs as Phaser.GameObjects.Image[];
          pole!.setPosition(cx, base);
          pole!.setScale(0.8 / R);
          const up = 0.35 + 0.65 * sp.shown;
          const fy = base - 62 * 0.8 * up;
          const wob = Math.sin(tt * 5 + cx) * 0.05;
          flag!
            .setPosition(cx + 2, fy + 4)
            .setRotation(wob)
            .setAlpha(1 - sp.shown)
            .setScale(0.75 / R);
          flagOn!
            .setPosition(cx + 2, fy + 4)
            .setRotation(wob)
            .setAlpha(sp.shown)
            .setScale(0.75 / R);
          break;
        }
        case 'goal': {
          const base = e.y + e.h;
          const [halo, pole, flag] = sp.objs as Phaser.GameObjects.Image[];
          halo!.setPosition(cx, base - 40).setAlpha((e.on ? 0.95 : 0.4) + Math.sin(tt * 3) * 0.12);
          pole!.setPosition(cx, base).setScale((1.3 / R) * 1.0);
          flag!
            .setPosition(cx + 3, base - 98)
            .setRotation(Math.sin(tt * 4) * 0.04)
            .setScale((1.0 + Math.sin(tt * 4.4) * 0.03) / R, 1 / R);
          break;
        }
        case 'ring': {
          sp.flag!.setPosition(cx, cy).setRotation(e.on ? tt * 1.5 : 0);
          sp.halo!.setPosition(cx, cy)
            .setAlpha(sp.shown * 0.8)
            .setScale(0.9 / R);
          break;
        }
        case 'box':
        case 'heavyBox': {
          sp.flag!.setPosition(cx, cy).setScale(e.w / 48 / R, e.h / 48 / R);
          sp.flag!.setAlpha(e.holder >= 0 ? 0.92 : 1);
          if (sp.text)
            sp.text
              .setText(e.label)
              .setPosition(cx, e.y - 2)
              .setVisible(e.label !== '');
          break;
        }
        case 'key': {
          const bob = Math.sin(tt * 3.4 + cx) * 3;
          sp.objs.forEach((o) => (o as Phaser.GameObjects.Image).setVisible(!e.on || e.holder >= 0));
          sp.flag!.setPosition(cx, cy + bob);
          sp.halo!.setPosition(cx, cy + bob).setAlpha(0.55);
          break;
        }
        case 'rock': {
          sp.flag!.setPosition(cx, cy).setRotation(tt * 3);
          break;
        }
        case 'saw': {
          sp.flag!.setPosition(cx, cy)
            .setRotation(tt * 9)
            .setScale(Math.max(e.w, e.h) / 56 / R);
          break;
        }
        case 'plate':
          drawPlate(sp, e);
          break;
        case 'lever':
          drawLever(sp, e);
          break;
        case 'gate':
          drawGate(sp, e, pal.wood);
          break;
        case 'ladder':
          drawLadderEnt(sp, e, this.biome);
          break;
        case 'mover':
        case 'balance':
          drawMover(sp, e, pal.wood, pal.woodDark);
          break;
        case 'crumble':
          drawCrumbleEnt(sp, e, this.t, this.biome);
          break;
        case 'target':
          drawTarget(sp, e);
          break;
        case 'enemy':
          drawEnemy(sp, e, this.t);
          break;
        case 'pickaxe':
          drawPickaxe(sp, e, this.t);
          break;
        case 'lantern':
          drawLantern(sp, e, this.t);
          break;
        case 'sinker':
          drawSinker(sp, e);
          break;
        case 'geyser':
          drawGeyser(sp, e, this.t);
          break;
      }
    }
    for (const [id, sp] of this.sprites)
      if (!sp.seen) {
        sp.objs.forEach((o) => o.destroy());
        this.sprites.delete(id);
      }
    void players;
  }

  destroy() {
    for (const sp of this.sprites.values()) sp.objs.forEach((o) => o.destroy());
    this.sprites.clear();
  }
}

// World-space hint signs (LevelDef.hints): a wooden board that fades in when someone is within 7 tiles.
