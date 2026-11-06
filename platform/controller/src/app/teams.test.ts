// The team strip and the swap button of a versus phone (teams.ts): the strip follows `you`, the name falls back to "Equipo N", the button asks the relay for the
// next team, and a team list that no longer holds this phone clears the strip. Fake DOM, no browser.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMsg, TeamInfo } from '@pichi/core';
import { createTeams, type YouMsg } from './teams';
import type { Session } from './store';

type El = { textContent: string; disabled?: boolean; handler?: (e: { preventDefault(): void }) => void; addEventListener(t: string, h: El['handler']): void };
const els = new Map<string, El>();
const el = (id: string): El => {
  if (!els.has(id)) els.set(id, { textContent: '', addEventListener(_t, h) { this.handler = h; } });
  return els.get(id)!;
};
const props: Record<string, string> = {};
const sent: ClientMsg[] = [];
const team = (id: number, ids: number[], name = `Rojo${id}`): TeamInfo => ({ id, name, color: '#f00', icon: 'R', playerIds: ids }) as unknown as TeamInfo;
const you = (over: Partial<YouMsg> = {}): YouMsg => ({ teamId: 1, color: '#0af', icon: 'B', sideLabel: 'izquierda', ...over });
const session = (over: Partial<Session> = {}) =>
  ({
    root: { dataset: {} as Record<string, string> },
    $: el,
    ws: { readyState: 1, send: (d: string) => sent.push(JSON.parse(d)) },
    myId: 7,
    myTeam: null,
    teams: null,
    teamsLocked: false,
    ...over,
  }) as unknown as Session;
const tap = () => el('teamswap').handler?.({ preventDefault: vi.fn() });

beforeEach(() => {
  els.clear();
  sent.length = 0;
  for (const k of Object.keys(props)) delete props[k];
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => (props[k] = v) } } });
});

describe('show', () => {
  it('paints the strip in both views with the team colour, icon, name and kitchen side', () => {
    const s = session({ teams: [team(0, []), team(1, [7], 'Azul')] });
    createTeams(s).show(you());
    expect(s.myTeam).toBe(1);
    expect(s.root.dataset.team).toBe('on');
    expect(props['--tc']).toBe('#0af');
    for (const k of ['', '2']) {
      expect(el(`tcicon${k}`).textContent).toBe('B');
      expect(el(`tcname${k}`).textContent).toBe('Azul');
      expect(el(`tcside${k}`).textContent).toBe('· cocina izquierda');
    }
  });
  it('without a name from the list the team is "Equipo N", and without a side the side line is empty', () => {
    const s = session();
    createTeams(s).show(you({ teamId: 1, sideLabel: undefined }));
    expect(el('tcname').textContent).toBe('Equipo 2');
    expect(el('tcside').textContent).toBe('');
  });
  it('null hides the strip and forgets the team', () => {
    const s = session({ myTeam: 1 });
    createTeams(s).show(null);
    expect(s.myTeam).toBeNull();
    expect(s.root.dataset.team).toBe('off');
    expect(props['--tc']).toBeUndefined();
  });
});

describe('apply', () => {
  it('keeps the list only when there are two teams or more (coop has none)', () => {
    const s = session();
    const ui = createTeams(s);
    ui.apply([team(0, [7])], false);
    expect(s.teams).toBeNull();
    ui.apply(null, false);
    expect(s.teams).toBeNull();
    ui.apply([team(0, [7]), team(1, [])], false);
    expect(s.teams).toHaveLength(2);
  });
  it('locks the swap button and renames it', () => {
    const ui = createTeams(session());
    ui.apply([team(0, [7]), team(1, [])], true);
    expect(el('teamswap')).toMatchObject({ disabled: true, textContent: 'Equipos bloqueados' });
    ui.apply([team(0, [7]), team(1, [])], false);
    expect(el('teamswap')).toMatchObject({ disabled: false, textContent: 'Cambiar de equipo' });
  });
  it('a list that no longer has this phone in any team clears the strip; one that has it leaves it', () => {
    const s = session({ myTeam: 0 });
    const ui = createTeams(s);
    ui.apply([team(0, [7]), team(1, [8])], false);
    expect(s.myTeam).toBe(0);
    ui.apply([team(0, [9]), team(1, [8])], false);
    expect(s.myTeam).toBeNull();
    expect(s.root.dataset.team).toBe('off');
  });
});

describe('the swap button', () => {
  it('asks for the next team, wrapping round to the first', () => {
    const s = session({ teams: [team(0, []), team(1, [7]), team(2, [])], myTeam: 1 });
    createTeams(s);
    tap();
    expect(sent).toEqual([{ t: 'setTeam', teamId: 2 }]);
    s.myTeam = 2;
    tap();
    expect(sent[1]).toEqual({ t: 'setTeam', teamId: 0 });
  });
  it('sends nothing when locked, without a team, or without teams', () => {
    const s = session({ teams: [team(0, []), team(1, [7])], myTeam: 1, teamsLocked: true });
    createTeams(s);
    tap();
    s.teamsLocked = false;
    s.myTeam = null;
    tap();
    s.myTeam = 1;
    s.teams = null;
    tap();
    expect(sent).toEqual([]);
  });
  it('stops the default of the touch', () => {
    createTeams(session());
    const preventDefault = vi.fn();
    el('teamswap').handler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });
});
