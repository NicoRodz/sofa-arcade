import { describe, expect, it } from 'vitest';
import { ALL_KINDS, PLUS_KINDS } from '../../sim';
import { CARD_COLOR, CARD_HEX, drawIcon } from '../../screen/art/glyphs';
import { drawTapes, drawPlusCarrier } from '../../screen/match/scene-plus';
import { plus, plusRound, put, tick, USE, give } from '../sabotage-plus/plus-drive';
import { recorder } from './recorder';

const silhouette = (kind: (typeof ALL_KINDS)[number]): string => {
  const r = recorder();
  drawIcon(r.proxy as never, kind, 100, 100, 40, 0);
  return r.calls.filter((c) => !c.startsWith('fillStyle(') && !c.startsWith('lineStyle(')).join('|');
};

describe('the ten sabotage icons read without colour', () => {
  it('there are 10 cards and each has a hex colour and its Phaser number', () => {
    expect(ALL_KINDS).toHaveLength(10);
    for (const k of ALL_KINDS) expect(CARD_HEX[k]).toMatch(/^#[0-9A-F]{6}$/);
  });
  it('the 10 colours and the 10 silhouettes are all different', () => {
    expect(new Set(ALL_KINDS.map((k) => CARD_COLOR[k])).size).toBe(10);
    expect(new Set(ALL_KINDS.map(silhouette)).size).toBe(10);
  });
  it('each new icon draws its own shape on the card (not a copy of a v1 one)', () => {
    for (const k of PLUS_KINDS) expect(silhouette(k).length).toBeGreaterThan(200);
  });
  it('the sponge is a rounded block with five holes, and the icon is the disc plus that block (the holes are what makes it a sponge)', () => {
    const calls = silhouette('sponge').split('|');
    expect(calls.filter((c) => c.startsWith('fillRoundedRect(')).length).toBe(1);
    const disc = silhouette('swap').split('|').filter((c) => c.startsWith('fillCircle(')).length; // the swap draws the disc and no holes
    expect(calls.filter((c) => c.startsWith('fillCircle(')).length).toBeGreaterThanOrEqual(disc + 5);
  });
  it('the dizzy spiral turns with the spin; the others ignore it', () => {
    const spun = (k: (typeof ALL_KINDS)[number], spin: number) => {
      const r = recorder();
      drawIcon(r.proxy as never, k, 100, 100, 40, spin);
      return r.calls.join('|');
    };
    expect(spun('dizzy', 0)).not.toBe(spun('dizzy', 1));
    expect(spun('tape', 0)).toBe(spun('tape', 1));
  });
});

describe('the scene layer of F8a draws what the state says', () => {
  const frame = () => {
    const r = recorder();
    return { r, f: { g: r.proxy as never, x0: 100, y0: 100, px: 64 } };
  };
  it('a tape is a border around the 3x3; no tape, nothing drawn; it blinks in its last second', () => {
    const s = plusRound([0, 1]);
    const none = frame();
    drawTapes(none.f, s);
    expect(none.r.calls).toEqual([]);
    plus(s).tapes.push({ x: 10, y: 5, team: 1, left: 200 });
    const one = frame();
    drawTapes(one.f, s);
    expect(one.r.calls.join('|')).toContain('strokeRect(678.000,358.000,188.000,188.000)'); // the 3x3 box: (10-1)*64+100+2, (5-1)*64+100+2, 3*64-4
    plus(s).tapes[0]!.left = 12; // an "off" phase of the blink
    const off = frame();
    drawTapes(off.f, s);
    expect(off.r.calls).toEqual([]);
  });
  it('a body is drawn with the aura of its Mareo charge, its dizziness, its sponge and its swap', () => {
    const s = plusRound([0, 1]);
    put(s, 0, 10, 0);
    put(s, 1, 11, 0);
    const of = (i: number) => {
      const o = frame();
      drawPlusCarrier(o.f, s, i, 300, 300);
      return o.r.calls.join('|');
    };
    expect(of(0)).toBe(''); // nothing running: nothing drawn
    give(s, 0, 'dizzy');
    tick(s, { 0: USE });
    const charging = of(0);
    expect(charging.length).toBeGreaterThan(100);
    plus(s).dizzy[1] = 100;
    expect(of(1)).not.toBe(of(0));
    plus(s).sponge[1] = 100;
    plus(s).soaked[1] = 4;
    expect(of(1).split('fillCircle').length).toBe(5); // four drops
    plus(s).swapFx[1] = 10;
    expect(of(1)).toContain('strokeCircle');
  });
});
