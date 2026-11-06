// The Pizzas lobby keys (E for events, the arrows for the sabotage level, which the Captain's D-pad also sends) and how the difficulty carries the sabotage level.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@pichi/core';
import { DEFAULT_CONFIG } from '@pichi/catalog';
import { app, bindServices } from '@pichi/screen-kit/shell';
import { pz } from '../state';
import { setMode } from './sync';
import { difficultyPatch, lobbyKey } from './lobby';

vi.hoisted(() => vi.stubGlobal('location', { search: '', host: 'x' }));
afterAll(() => vi.unstubAllGlobals());
vi.mock('phaser', () => ({ default: {} }));
vi.mock('@pichi/screen-kit/net', () => ({ sendMsg: () => {} }));

const seat = (n: number) => {
  app.players.clear();
  for (let i = 0; i < n; i++)
    app.players.set(i + 1, { info: { id: i + 1, slot: i, name: `P${i + 1}`, connected: true } as PublicPlayer } as never);
};
const versus = (sabotage: string) => {
  seat(4);
  setMode('versus');
  app.config = { ...app.config, modeOptions: { ...app.config.modeOptions, sabotage } };
  pz.sabotageTouched = false;
};

beforeEach(() => {
  bindServices({ ui: () => {}, render: () => {} });
  app.phase = 'lobby';
  app.config = { ...DEFAULT_CONFIG, seed: 1, difficulty: 'normal', modeOptions: { events: true } } as never;
  pz.sabotageTouched = false;
  seat(3);
});

describe('lobbyKey', () => {
  it('E flips the mid-round events and takes the key; E held down does not flip it again and is not taken', () => {
    expect(lobbyKey('e', false)).toBe(true);
    expect(app.config.modeOptions.events).toBe(false);
    expect(lobbyKey('E', false)).toBe(true);
    expect(app.config.modeOptions.events).toBe(true);
    expect(lobbyKey('e', true)).toBe(false);
    expect(app.config.modeOptions.events).toBe(true);
  });
  it('in versus the arrows step the sabotage level (off, soft, chaos) and stop at the ends', () => {
    versus('soft');
    expect(lobbyKey('ArrowRight', false)).toBe(true);
    expect(app.config.modeOptions.sabotage).toBe('chaos');
    expect(lobbyKey('ArrowRight', false)).toBe(true);
    expect(app.config.modeOptions.sabotage).toBe('chaos');
    lobbyKey('ArrowLeft', false);
    lobbyKey('ArrowLeft', false);
    expect(app.config.modeOptions.sabotage).toBe('off');
    lobbyKey('ArrowLeft', false);
    expect(app.config.modeOptions.sabotage).toBe('off');
    expect(pz.sabotageTouched).toBe(true);
  });
  it('in coop the arrows are not ours (the menu keeps them), and neither is any other key', () => {
    expect(lobbyKey('ArrowRight', false)).toBe(false);
    expect(lobbyKey('ArrowLeft', false)).toBe(false);
    expect(lobbyKey('x', false)).toBe(false);
    expect(app.config.modeOptions).toEqual({ events: true });
  });
});

describe('difficultyPatch', () => {
  it('coop has no sabotage to carry', () => {
    expect(difficultyPatch('hard')).toEqual({});
  });
  it('versus until the host picks: Difícil brings Caos, the others Suave, keeping the other options', () => {
    versus('off');
    app.config = { ...app.config, modeOptions: { ...app.config.modeOptions, handicap: true } };
    expect(difficultyPatch('hard')).toEqual({ modeOptions: expect.objectContaining({ sabotage: 'chaos', handicap: true }) });
    expect(difficultyPatch('easy')).toEqual({ modeOptions: expect.objectContaining({ sabotage: 'soft' }) });
  });
  it('once the host picked a level by hand, the difficulty leaves it alone', () => {
    versus('off');
    pz.sabotageTouched = true;
    expect(difficultyPatch('hard')).toEqual({});
  });
});
