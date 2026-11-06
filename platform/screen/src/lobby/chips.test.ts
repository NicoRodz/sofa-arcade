// The lobby chips: one persistent element per slot, rendered by lit and only re-animated when something about the player really changed.
// The painters (canvases, lit) are fakes that record who got what; chipView and chefOf are the real ones.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicPlayer } from '@pichi/core';

const calls = vi.hoisted(() => ({
  render: [] as { slot: number; name: string; classes: Record<string, boolean>; avatar: unknown; badge: unknown }[],
  replay: [] as string[],
  avatars: 0,
  chefs: 0,
  badges: 0,
}));
const state = vi.hoisted(() => ({ players: new Map<number, { info: unknown }>(), captainId: null as number | null, ui: [] as string[] }));

vi.mock('../shell/app-state', () => ({
  app: state,
  services: { ui: (id: string) => state.ui.push(id) },
}));
vi.mock('../art/chef', () => ({
  chefCanvas: () => ({ kind: 'chef', n: ++calls.chefs }),
  assistBadgeCanvas: () => ({ kind: 'badge', n: ++calls.badges, className: '' }),
}));
vi.mock('./chip-avatar', () => ({
  avatarKey: (ap: { code: string }, color: string) => `${ap.code}|${color}`,
  avatarCanvas: (ap: { code: string }) => ({ kind: 'avatar', code: ap.code, n: ++calls.avatars }),
  replay: (el: { tag?: string }, cls: string) => calls.replay.push(`${el.tag ?? 'chip'}:${cls}`),
}));
vi.mock('../screens/lobby/view', () => ({
  renderChip: (el: { slot: number }, view: { name: string; classes: Record<string, boolean> }, avatar: unknown, badge: unknown) =>
    calls.render.push({ slot: el.slot, name: view.name, classes: view.classes, avatar, badge }),
}));

class FakeEl {
  static last = 0;
  slot = FakeEl.last++;
  tag = 'chip';
  className = '';
  style = { setProperty: vi.fn() };
  av = { tag: 'av' };
  querySelector = () => this.av;
}
const toggles: Record<string, boolean> = {};
const hosts: Record<string, { appendChild?: (e: FakeEl) => void; replaceChildren?: (...e: FakeEl[]) => void; classList: { toggle: (c: string, on: boolean) => void } }> = {};
const host = (id: string) =>
  (hosts[id] ??= {
    classList: { toggle: (c, on) => void (toggles[`${id}.${c}`] = on) },
    appendChild: vi.fn(),
    replaceChildren: vi.fn(),
  });

let mod: typeof import('./chips');
const pl = (id: number, slot: number, over: Partial<PublicPlayer> = {}) => {
  const info = { id, slot, name: `P${id}`, connected: true, ...over } as PublicPlayer;
  state.players.set(id, { info });
  return info;
};
const last = (slot: number) => [...calls.render].reverse().find((r) => r.slot === slot)!;

beforeEach(async () => {
  vi.resetModules();
  FakeEl.last = 0;
  calls.render.length = 0;
  calls.replay.length = 0;
  calls.avatars = calls.chefs = calls.badges = 0;
  state.players.clear();
  state.captainId = null;
  state.ui.length = 0;
  for (const k of Object.keys(toggles)) delete toggles[k];
  for (const k of Object.keys(hosts)) delete hosts[k];
  vi.stubGlobal('document', { createElement: () => new FakeEl(), getElementById: (id: string) => host(id) });
  mod = await import('./chips');
  mod.initChips();
  calls.render.length = 0;
});

describe('initChips', () => {
  it('makes eight empty chips, each in its slot colour, attached to #chips', () => {
    expect(mod.chips).toHaveLength(8);
    expect(host('chips').appendChild).toHaveBeenCalledTimes(8);
    for (const c of mod.chips) {
      expect((c.el as unknown as FakeEl).className).toBe('chip empty');
      expect((c.el as unknown as FakeEl).style.setProperty).toHaveBeenCalledWith('--c', expect.stringMatching(/^#/));
      expect(c.who).toBe(-1);
    }
  });
});

describe('renderChips', () => {
  it('seats a player by slot (modulo 8); the rest render as empty, once each', () => {
    pl(5, 2);
    mod.renderChips();
    expect(calls.render).toHaveLength(8);
    expect(last(2).classes.empty).toBe(false);
    expect(last(3).classes.empty).toBe(true);
    expect(mod.chips[2]!.who).toBe(5);
  });
  it('a slot of 10 wraps onto chip 2', () => {
    pl(1, 10);
    mod.renderChips();
    expect(mod.chips[2]!.who).toBe(1);
  });
  it('a player with no look of their own gets the neutral chef face and no puff', () => {
    pl(5, 0);
    mod.renderChips();
    expect(calls.chefs).toBe(1);
    expect(calls.avatars).toBe(0);
    expect(mod.chips[0]!.look).toBe('');
    expect(last(0).avatar).toMatchObject({ kind: 'chef' });
  });
  it('a player with a look gets their avatar, and a new player pops the chip', () => {
    pl(5, 0, { ap: { code: 'a' } as never });
    mod.renderChips();
    expect(calls.avatars).toBe(1);
    expect(mod.chips[0]!.look).toMatch(/^a\|#/);
    expect(calls.replay).toEqual(['chip:pop']);
  });
  it('rendering again with nothing changed keeps the same avatar node and animates nothing', () => {
    pl(5, 0, { ap: { code: 'a' } as never });
    mod.renderChips();
    const node = mod.chips[0]!.avatar;
    calls.replay.length = 0;
    mod.renderChips();
    expect(mod.chips[0]!.avatar).toBe(node);
    expect(calls.avatars).toBe(1);
    expect(calls.replay).toEqual([]);
  });
  it('a live change of look under a seated player redraws the avatar and puffs it (no pop)', () => {
    const info = pl(5, 0, { ap: { code: 'a' } as never });
    mod.renderChips();
    calls.replay.length = 0;
    info.ap = { code: 'b' } as never;
    mod.renderChips();
    expect(calls.avatars).toBe(2);
    expect(calls.replay).toEqual(['av:puff']);
  });
  it('another player taking the slot pops the chip again', () => {
    pl(5, 0);
    mod.renderChips();
    calls.replay.length = 0;
    state.players.clear();
    pl(6, 0);
    mod.renderChips();
    expect(mod.chips[0]!.who).toBe(6);
    expect(calls.replay).toEqual(['chip:pop']);
  });
  it('a player leaving resets the chip: the next one is a new arrival with a fresh look', () => {
    pl(5, 0, { ap: { code: 'a' } as never });
    mod.renderChips();
    state.players.clear();
    mod.renderChips();
    expect(mod.chips[0]).toMatchObject({ who: -1, look: '', making: false, avatar: null, badge: null });
    expect(last(0).classes.empty).toBe(true);
    calls.replay.length = 0;
    pl(5, 0, { ap: { code: 'a' } as never });
    mod.renderChips();
    expect(calls.replay).toEqual(['chip:pop']);
    expect(calls.avatars).toBe(2);
  });
  it('the Ayudante sticker is made once, kept between renders and dropped when the player stops assisting', () => {
    const info = pl(5, 0, { assist: true });
    mod.renderChips();
    expect(calls.badges).toBe(1);
    expect(last(0).badge).toMatchObject({ kind: 'badge', className: 'hbadge' });
    mod.renderChips();
    expect(calls.badges).toBe(1);
    info.assist = false;
    mod.renderChips();
    expect(mod.chips[0]!.badge).toBeNull();
    expect(last(0).badge).toBeNull();
  });
  it('finishing the creator ("Listo") hops the avatar and plays the plink; entering it does not', () => {
    const info = pl(5, 0, { customizing: true });
    mod.renderChips();
    mod.renderChips();
    calls.replay.length = 0;
    expect(state.ui).toEqual([]);
    info.customizing = false;
    mod.renderChips();
    expect(calls.replay).toEqual(['av:hop']);
    expect(state.ui).toEqual(['plink']);
    mod.renderChips();
    expect(state.ui).toEqual(['plink']); // once
  });
  it('the crown shows on the captain chip', () => {
    pl(5, 0);
    state.captainId = 5;
    pl(6, 1);
    mod.renderChips();
    expect(last(0).name).toBe('👑 P5');
    expect(last(1).name).toBe('P6');
  });
});

describe('teams columns', () => {
  it('showTeams(true) hides the chips row and shows the teams and their bar', () => {
    mod.showTeams(true);
    expect(toggles).toEqual({ 'chips.off': true, 'teams.off': false, 'teambar.off': false });
  });
  it('showTeams(false) after the games took the chips brings the elements home, in order, once', () => {
    mod.chipsMovedToTeams();
    mod.showTeams(true);
    mod.showTeams(false);
    expect(toggles).toEqual({ 'chips.off': false, 'teams.off': true, 'teambar.off': true });
    const home = hosts.chips!.replaceChildren as ReturnType<typeof vi.fn>;
    expect(home).toHaveBeenCalledTimes(1);
    expect(home.mock.calls[0]).toEqual(mod.chips.map((c) => c.el));
    mod.showTeams(false);
    expect(home).toHaveBeenCalledTimes(1);
  });
  it('showTeams(false) without the chips having moved leaves them where they are', () => {
    mod.showTeams(false);
    expect(host('chips').replaceChildren).not.toHaveBeenCalled();
  });
});
