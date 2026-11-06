// The Captain's remote (captain.ts): who counts as Captain, when the D-pad shows (never in the round, never on a dead socket), the crown on the name,
// the waiting text, and the nav key that goes to the relay with no id. The touch menu and the D-pad binding are mocked: they have their own tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg } from '@pichi/core';
import type { Session } from './store';
import { createCaptain } from './captain';

const bound: { env?: { isCaptain(): boolean; send(k: string): void; isNavKey(k: unknown): boolean } } = {};
const menu = { refresh: vi.fn(), onMessage: vi.fn() };
vi.mock('../menu/captain-menu', () => ({ createCaptainMenu: () => menu }));
vi.mock('../remote', () => ({ bindRemote: (_b: unknown, env: (typeof bound)['env']) => (bound.env = env) }));

const texts = new Map<string, { textContent: string }>();
const sent: ClientMsg[] = [];
const session = (over: Partial<Session> = {}) =>
  ({
    root: { dataset: {} as Record<string, string>, querySelectorAll: () => [] },
    $: (id: string) => {
      if (!texts.has(id)) texts.set(id, { textContent: '' });
      return texts.get(id);
    },
    ws: { readyState: 1, send: (d: string) => sent.push(JSON.parse(d)) },
    joined: true,
    phase: 'lobby',
    captainId: 5,
    myId: 5,
    myName: 'Ana',
    myTeam: null,
    ...over,
  }) as unknown as Session;

beforeEach(() => {
  texts.clear();
  sent.length = 0;
  menu.refresh.mockClear();
  vi.stubGlobal('WebSocket', { OPEN: 1 });
});

afterEach(() => vi.unstubAllGlobals());

describe('isCaptain', () => {
  it('needs the socket joined and the crown to be this phone', () => {
    const s = session();
    const { isCaptain } = createCaptain(s, []);
    expect(isCaptain()).toBe(true);
    s.joined = false;
    expect(isCaptain()).toBe(false);
    s.joined = true;
    s.captainId = 6;
    expect(isCaptain()).toBe(false);
  });
  it('nobody holding the crown is nobody, even for a phone with id 0 (not joined yet)', () => {
    const s = session({ captainId: null, myId: 0 });
    expect(createCaptain(s, []).isCaptain()).toBe(false);
  });
});

describe('render', () => {
  it('the D-pad is on for the Captain in the lobby, off in the round, in the school, and for everyone else', () => {
    const s = session();
    const c = createCaptain(s, []);
    c.render();
    expect(s.root.dataset.remote).toBe('on');
    s.phase = 'playing';
    c.render();
    expect(s.root.dataset.remote).toBe('off');
    s.phase = 'school';
    c.render();
    expect(s.root.dataset.remote).toBe('off');
    s.phase = 'results';
    s.captainId = 9;
    c.render();
    expect(s.root.dataset.remote).toBe('off');
  });
  it('a dropped socket takes the D-pad away: a button that cannot send would lie', () => {
    const s = session({ joined: false });
    createCaptain(s, []).render();
    expect(s.root.dataset.remote).toBe('off');
  });
  it('puts the crown before the name of the Captain only, in both views', () => {
    const s = session();
    const c = createCaptain(s, []);
    c.render();
    expect(texts.get('who')!.textContent).toBe('👑 Ana');
    expect(texts.get('who2')!.textContent).toBe('👑 Ana');
    s.captainId = 1;
    c.render();
    expect(texts.get('who')!.textContent).toBe('Ana');
  });
  it('refreshes the touch menu and every school, and writes the waiting text', () => {
    const refreshCaptain = vi.fn();
    const s = session();
    createCaptain(s, [{ refreshCaptain } as never]).render();
    expect(menu.refresh).toHaveBeenCalledTimes(1);
    expect(refreshCaptain).toHaveBeenCalledTimes(1);
    expect(texts.get('waitmsg')!.textContent).toBe('Eres el Capitán');
    s.captainId = 1;
    createCaptain(s, []).render();
    expect(texts.get('waitmsg')!.textContent).toBe('Elige el Capitán');
  });
});

describe('the D-pad binding', () => {
  it('sends the key as a nav message, nothing else in it', () => {
    createCaptain(session(), []);
    bound.env!.send('left');
    expect(sent).toEqual([{ t: 'nav', key: 'left' }]);
  });
  it('asks the same Captain question as the rest of the phone', () => {
    const s = session();
    createCaptain(s, []);
    expect(bound.env!.isCaptain()).toBe(true);
    s.captainId = 1;
    expect(bound.env!.isCaptain()).toBe(false);
  });
  it('accepts the keys the protocol names and rejects others', () => {
    createCaptain(session(), []);
    expect(bound.env!.isNavKey('ok')).toBe(true);
    expect(bound.env!.isNavKey('fly')).toBe(false);
  });
});
