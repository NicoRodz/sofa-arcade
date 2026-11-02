// Team look: the split of a figure into garment (takes the team colour) and body (does not), and the legibility of every look in both teams.
import { describe, expect, it } from 'vitest';
import {
  avatarParts,
  defaultAppearance,
  FIELD_SIZE,
  FIELDS,
  HAIR_COLORS,
  SKIN_TONES,
  randomAppearance,
  type Appearance,
} from '@pichi/core/avatar';
import { RecordingPainter } from '@pichi/core/avatar/recording-painter';
import { makeCtx } from '@pichi/core/avatar/parts';
import { CLOTHES } from '@pichi/core/avatar/parts/data';
import { mulberry32 } from '@pichi/core/rng';
import { deltaE } from './color-delta';
import { GREY_MAX, GREY_MIN, figureLayers, greyOf, recordFigure } from './look-layers';
import { replay } from './look-ops';

const INK = '#2A211C';
const ORANGE = 0xe69f00;
const BLUE = 0x0072b2;
const base = defaultAppearance(0);
const view = 'front' as const;
const role = 'arena';

/** Every look the tests sweep: each value of each field alone, plus 300 random looks. */
function looks(): Appearance[] {
  const out: Appearance[] = [];
  for (const f of FIELDS) for (let v = 0; v < FIELD_SIZE[f]; v++) out.push({ ...base, [f]: v });
  const rng = mulberry32(7);
  for (let i = 0; i < 300; i++) out.push(randomAppearance(rng));
  return out;
}

const mul = (grey: string, team: number): string => {
  const k = parseInt(grey.slice(1, 3), 16) / 255;
  const ch = (s: number) => Math.round(((team >> s) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
};
const lumOf = (hex: string) =>
  (0.2126 * parseInt(hex.slice(1, 3), 16) + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16)) / 255;
/** Deuteranopia (Machado 2009, severity 1) on linear RGB: the pair of team colours must still read apart. */
function deuteranope(hex: string): string {
  const lin = (i: number) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2;
  const [r, g, b] = [lin(1), lin(3), lin(5)] as const;
  const m = [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ] as const;
  const out = m.map((row) => Math.round(Math.min(1, Math.max(0, row[0] * r + row[1] * g + row[2] * b)) ** (1 / 2.2) * 255));
  return `#${((1 << 24) | (out[0]! << 16) | (out[1]! << 8) | out[2]!).toString(16).slice(1)}`;
}

describe('team look: replaying a recorded figure', () => {
  it('redraws exactly what the avatar parts draw, call by call', () => {
    for (const ap of [base, { ...base, cl: 4, hat: 3, bk: 2, gl: 2 }, { ...base, g: 0, cl: 9, hat: 5, bk: 5 }]) {
      const direct = new RecordingPainter();
      const c = makeCtx(ap, { view, t: 0, slotColor: '#ffffff', role });
      for (const part of avatarParts(ap, view, role)) {
        if (part.id === 'ring') continue;
        direct.save();
        part.draw(direct, c);
        direct.restore();
      }
      const again = new RecordingPainter();
      replay(recordFigure(ap, view, role), again, (_i, op) => op.color);
      expect(again.log).toEqual(direct.log);
    }
  });
});

describe('team look: garment and body', () => {
  it('every look has garment paint and body paint, and the probe draws the same ops (so the split is sound)', () => {
    for (const ap of looks()) {
      const { layer } = figureLayers(ap, view, role); // throws if the probe drew another number of ops
      expect(layer.filter((l) => l === 'garment').length).toBeGreaterThan(0);
      expect(layer.filter((l) => l === 'body').length).toBeGreaterThan(0);
    }
  });

  it('the skin, the hair and the ink outlines are never garment; the shirt always is', () => {
    for (const ap of looks()) {
      const { ops, layer } = figureLayers(ap, view, role);
      const cl = CLOTHES[ap.cl]!;
      const own = new Set([cl.top, cl.bottom, cl.accent]); // some outfits use the ink or a hair colour as their own detail: those ARE garment
      const notGarment = new Set([INK, SKIN_TONES[ap.sk]!, HAIR_COLORS[ap.hc]!].filter((c) => !own.has(c)));
      ops.forEach((op, i) => {
        if (op.t !== 'paint') return;
        if (notGarment.has(op.color)) expect(layer[i], `${op.name} ${op.color}`).toBe('body');
      });
      // the shirt: some fill in the main colour of the outfit is garment (white shoes or an apron may share the colour, they stay body)
      const tops = ops.filter((op, i) => op.t === 'paint' && op.name === 'fill' && op.color === cl.top && layer[i] === 'garment');
      expect(tops.length, `look ${JSON.stringify(ap)}`).toBeGreaterThan(0);
    }
  });

  it('only garment paints are greys within [0.55, 1.0] luminance; body paints keep no grey', () => {
    for (const ap of looks()) {
      const { layer, grey } = figureLayers(ap, view, role);
      layer.forEach((l, i) => {
        if (l === 'garment') {
          const g = grey[i]!;
          expect(g).toMatch(/^#([0-9a-f]{2})\1\1$/);
          const v = parseInt(g.slice(1, 3), 16) / 255;
          expect(v).toBeGreaterThanOrEqual(GREY_MIN - 0.003);
          expect(v).toBeLessThanOrEqual(GREY_MAX);
        } else expect(grey[i]).toBeUndefined();
      });
    }
  });

  it('a hat, a cape and a hat-less head add or remove garment paint as the look says', () => {
    const count = (ap: Appearance) => figureLayers(ap, view, role).layer.filter((l) => l === 'garment').length;
    const bare = { ...base, hat: 0, bk: 0 };
    for (const hat of [1, 2, 3, 4, 5]) expect(count({ ...bare, hat }), `hat ${hat}`).toBeGreaterThan(count(bare));
    for (const bk of [1, 2, 3, 4, 5]) expect(count({ ...bare, bk }), `back item ${bk}`).toBeGreaterThanOrEqual(count(bare));
    expect(count({ ...bare, bk: 1 })).toBeGreaterThan(count(bare)); // the cape is the identity colour, so it is garment
  });

  it('the grey keeps the contrast between the main colour of the clothes and its details', () => {
    CLOTHES.forEach((c, id) => {
      if (c.deco === 'none') return;
      const detail = c.deco === 'overall' ? c.bottom : c.accent;
      const d = Math.abs(parseInt(greyOf(c.top, c.top).slice(1, 3), 16) - parseInt(greyOf(detail, c.top).slice(1, 3), 16)) / 255;
      expect(d, `clothes ${id} (${c.deco})`).toBeGreaterThanOrEqual(0.1);
    });
  });
});

describe('team look: every look reads in both teams', () => {
  it('the tinted shirt of each look is far from the other team (also for a deuteranope), from the skins and from the hair', () => {
    CLOTHES.forEach((c, id) => {
      const grey = greyOf(c.top, c.top);
      const [o, b] = [mul(grey, ORANGE), mul(grey, BLUE)];
      expect(deltaE(o, b), `clothes ${id}: orange vs blue`).toBeGreaterThan(60);
      expect(deltaE(deuteranope(o), deuteranope(b)), `clothes ${id}: orange vs blue, deuteranope`).toBeGreaterThan(40);
      for (const t of [o, b]) {
        for (const skin of SKIN_TONES) expect(deltaE(t, skin), `clothes ${id}: ${t} vs skin ${skin}`).toBeGreaterThan(25);
        for (const hair of HAIR_COLORS) expect(deltaE(t, hair), `clothes ${id}: ${t} vs hair ${hair}`).toBeGreaterThan(25);
        expect(lumOf(t), `clothes ${id}: ${t} is not black`).toBeGreaterThan(0.2);
      }
    });
  });
});
