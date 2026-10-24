import { describe, expect, it } from 'vitest';
import { COLORS } from '@party/shared';
import { COLS, ROWS } from '@party/shared/game';
import { CHEFS, FLOORS, H, HUD_H, OX, OY, SKINS, TILE, W, chefOf, floorPair, hairOf, progressColor, skinOf, timerColor, C } from '../src/art/tokens';
import { MAX_TICKETS, TICKET_SHAKE_AT, TICKET_WIDTH, clockText, ticketXs } from '../src/art/layout';
import { CUT_KIND, ITEM_KIND, RAW_KIND } from '../src/art/food';
import { maxOrders } from '@party/shared/difficulty';

describe('layout', () => {
  it('the 16x9 map plus the HUD strip fits the 1920x1080 canvas', () => {
    expect(TILE).toBe(108);
    expect(OX).toBeGreaterThanOrEqual(0);
    expect(OX + COLS * TILE).toBeLessThanOrEqual(W);
    expect(OY).toBeGreaterThanOrEqual(HUD_H);
    expect(OY + ROWS * TILE).toBeLessThanOrEqual(H);
  });
});

describe('chefs', () => {
  it('has eight chefs with unique colours and accessories, matching the colours the server hands out', () => {
    expect(CHEFS).toHaveLength(8);
    expect(new Set(CHEFS.map((c) => c.color)).size).toBe(8);
    expect(new Set(CHEFS.map((c) => c.accessory)).size).toBe(8);
    expect(CHEFS.map((c) => c.color.toLowerCase())).toEqual(COLORS.map((c) => c.toLowerCase()));
  });
  it('wraps slots and rotates the four skin tones', () => {
    expect(chefOf(8)).toBe(CHEFS[0]);
    expect(chefOf(-1)).toBe(CHEFS[7]);
    expect([0, 1, 2, 3, 4].map(skinOf)).toEqual([SKINS[0], SKINS[1], SKINS[2], SKINS[3], SKINS[0]]);
    expect(hairOf(0)).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('timers', () => {
  it('ticket and bar colours follow the thresholds', () => {
    expect(timerColor(0.9)).toBe(C.basil);
    expect(timerColor(0.5)).toBe(C.warn);
    expect(timerColor(0.26)).toBe(C.warn);
    expect(timerColor(0.25)).toBe(C.danger);
    expect(progressColor(0.79)).toBe(C.basil);
    expect(progressColor(0.8)).toBe(C.cheese);
  });
  it('formats the round clock', () => {
    expect(clockText(180_000)).toBe('3:00');
    expect(clockText(59_001)).toBe('1:00');
    expect(clockText(9_500)).toBe('0:10');
    expect(clockText(-5)).toBe('0:00');
  });
});

describe('ticket strip', () => {
  it('spaces tickets evenly while they fit and overlaps them before the clock', () => {
    expect(ticketXs(0)).toEqual([]);
    const few = ticketXs(3);
    expect(few[1]! - few[0]!).toBe(TICKET_WIDTH + 10);
    const many = ticketXs(8);
    expect(many).toHaveLength(8);
    expect(many[7]! + TICKET_WIDTH).toBeLessThanOrEqual(872 + 0.001);
    expect(many[1]! - many[0]!).toBeLessThan(TICKET_WIDTH);
  });
});

describe('floors', () => {
  it('every fixed map has its own pair and random maps pick one by seed', () => {
    expect(new Set(Object.values(FLOORS).map((p) => p.join())).size).toBe(Object.keys(FLOORS).length);
    expect(floorPair('3')).toEqual(FLOORS['3']);
    expect(floorPair('random', 7)).toEqual(FLOORS['3']);
    expect(floorPair('random', 0)).toEqual(FLOORS['1']);
  });
});

describe('R23 tickets and R24 item state', () => {
  it('at most six tickets are drawn, as many as the biggest queue (8 players), and they tremble at 20% patience', () => {
    expect(MAX_TICKETS).toBe(6);
    expect(maxOrders(8)).toBeLessThanOrEqual(MAX_TICKETS);
    expect(TICKET_SHAKE_AT).toBe(0.2);
    expect(timerColor(TICKET_SHAKE_AT - 0.01)).toBe(C.danger); // the bar is red by then
  });
  it('raw and processed items are different pictures (shape, not only colour): ball vs disc, whole vs slices, block vs shreds', () => {
    const items = ['raw0', 'cut0', 'raw1', 'cut1', 'raw2', 'cut2'] as const;
    expect(new Set(items.map((i) => ITEM_KIND[i])).size).toBe(6);
    expect(RAW_KIND.every((k) => !CUT_KIND.includes(k))).toBe(true);
    expect(ITEM_KIND.dish).not.toBe(ITEM_KIND.dishQ);
    expect(ITEM_KIND.plate).not.toBe(ITEM_KIND.dirty);
  });
});
