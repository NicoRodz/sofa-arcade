// QA versus 31-oct M1: a phone that joins a versus round already running has no chef (the screen deals teams at the start). It used to
// show the pad and swallow every press for up to 3 minutes; now it says it enters the next round and shows no pad.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { violations } from './checks';
import { ORIENTATIONS, openSession, type Scenario, type Session } from './harness';

let s: Session;
beforeAll(async () => {
  s = await openSession();
}, 60_000);
afterAll(async () => {
  await s?.close();
}, 30_000);

const controls = {
  stick: { label: 'Mover', icon: 'move' },
  btn1: { label: 'Tomar / Soltar', icon: 'grab' },
  btn2: { label: 'Picar / Correr', icon: 'chop' },
};
const TEAMS = [
  { id: 0, name: 'Picantes', color: '#A8330A', icon: '▲', side: 'izquierda', playerIds: [2] },
  { id: 1, name: 'Frescos', color: '#14338A', icon: '●', side: 'derecha', playerIds: [3, 4] },
];
const mine = [{ ...TEAMS[0]!, playerIds: [1, 2] }, TEAMS[1]!]; // a phone (id 1) that is on a team
const msgs = (teams: object[], extra: object[]) => [
  { t: 'joined', player: { id: 1, name: 'Tarde', color: '#E63B2E', slot: 0 }, room: 'main', v: 2 },
  {
    t: 'config',
    game: 'pizzas',
    difficulty: 'normal',
    map: 'V1',
    seed: 1,
    controls,
    modeId: 'versus',
    teams,
    teamsLocked: true,
    modeOptions: {},
    howTo: { steps: [{ icon: 'crate', text: 'Toma masa' }], note: 'x' },
  },
  ...extra,
];
const match = { gameId: 'pizzas', modeId: 'versus', mapId: 'V1', difficulty: 'normal', teams: null, modeOptions: {} };
const playing = { t: 'phase', phase: 'playing', match };
const you = { t: 'you', teamId: 0, color: '#A8330A', icon: '▲', sideLabel: 'izquierda' };
const sc = (name: string, list: object[]): Scenario => ({ name, msgs: list });
const read = () =>
  s.eval<{ view: string; msg: string; padVisible: boolean }>(
    `({ view: document.body.dataset.view, msg: document.getElementById('waitmsg').textContent, padVisible: getComputedStyle(document.getElementById('pad')).visibility === 'visible' })`,
  );

describe('a phone with no team in a versus round', () => {
  it('shows "Entras en la próxima ronda" and no pad (it arrived after the round started)', async () => {
    await s.load(sc('late', msgs(TEAMS, [{ t: 'phase', phase: 'lobby' }, playing])));
    expect(await read()).toEqual({ view: 'lobby', msg: 'Entras en la próxima ronda', padVisible: false });
  });
  it('a phone on a team keeps the pad: with `you` before the phase and after it', async () => {
    await s.load(sc('on-team', msgs(mine, [you, playing])));
    expect(await read()).toMatchObject({ view: 'playing', padVisible: true });
    await s.load(sc('on-team-late-you', msgs(mine, [playing, you])));
    expect(await read()).toMatchObject({ view: 'playing', padVisible: true });
  });
  it('the next round deals it in: `you` arrives and the pad comes back', async () => {
    await s.load(sc('dealt', msgs(TEAMS, [playing, { t: 'phase', phase: 'results', scores: [] }, msgs(mine, [])[1]!, you, playing])));
    expect(await read()).toMatchObject({ view: 'playing', padVisible: true });
  });
  it('a coop round never shows the message', async () => {
    await s.load(sc('coop', msgs(TEAMS, [{ t: 'phase', phase: 'playing', match: { ...match, modeId: 'coop' } }])));
    expect(await read()).toMatchObject({ view: 'playing', padVisible: true });
  });
  for (const [orientation, vps] of Object.entries(ORIENTATIONS))
    it(`${orientation}: the message screen has no layout violations`, async () => {
      await s.load(sc('late', msgs(TEAMS, [{ t: 'phase', phase: 'lobby' }, playing])));
      const bad: string[] = [];
      for (const v of vps)
        for (const ins of v.insets) {
          await s.setViewport(v, ins);
          for (const m of violations(await s.probe())) bad.push(`${v.name}: ${m}`);
        }
      expect(bad).toEqual([]);
    }, 120_000);
});
