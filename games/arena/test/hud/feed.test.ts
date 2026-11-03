import { describe, expect, it } from 'vitest';
import { MAP_W, solidAt } from '../../map';
import { PLUS_KINDS, createManchazo, hashManchazo, isHidden, paintTile, type ManchazoState } from '../../sim';
import { Feed, SWING_COOL, feedHash } from '../../screen/match/hud/feed';
import { USE, give, put, tick as step } from '../sabotage/sab-drive';
import { plus, plusRound, playUses } from '../sabotage-plus/plus-drive';

/** Steps `n` ticks (inputs by body index) feeding the log after each one, as ManchazoRun does. */
function run(s: ManchazoState, feed: Feed, n: number, inputs: Parameters<typeof step>[1] = {}) {
  for (let k = 0; k < n; k++) {
    step(s, inputs);
    feed.observe(s);
  }
}
/** Paints `n` unpainted floor tiles for a team (read in order). */
function paint(s: ManchazoState, team: number, n: number) {
  let left = n;
  for (let y = 0; y < 15 && left > 0; y++)
    for (let x = 0; x < MAP_W && left > 0; x++)
      if (!solidAt(s.grid.map, x, y) && s.match.paint[y * MAP_W + x] === -1) {
        paintTile(s.match, x, y, team, s.grid.tick);
        left--;
      }
}

describe('the TV feed: which body played which sabotage', () => {
  it('logs one "fired" with tick, body, slot, team and card when a card is played', () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    run(s, f, 3);
    give(s, 1, 'roller');
    run(s, f, 2);
    expect(f.log).toEqual([]); // taking a card is not firing it
    run(s, f, 1, { 1: USE });
    expect(f.log).toEqual([{ type: 'fired', tick: s.grid.tick, body: 1, slot: 1, team: 1, kind: 'roller' }]);
  });

  it('the nine cards that play on the spot are announced (the sponge has its own test below)', () => {
    for (const [i, kind] of (['turpentine', 'roller', 'fan', 'footprints', 'glue', 'tape', 'ink', 'swap', 'dizzy'] as const).entries()) {
      const s = plusRound([0, 1]);
      put(s, 0, 10, 0); // a rival within range, so the swap and the dizzy are not refused
      put(s, 1, 12, 0);
      const f = new Feed();
      run(s, f, 1);
      give(s, 0, kind);
      run(s, f, 1); // the hand is seen holding it
      run(s, f, 1, { 0: USE });
      expect(
        f.log.map((e) => e.type === 'fired' && e.kind),
        `card ${i} ${kind}`,
      ).toEqual([kind]);
    }
  });

  it('the sponge is announced on its first press, not again when it runs out of time', () => {
    const s = plusRound([0, 1]);
    put(s, 0, 10, 0);
    put(s, 1, 12, 0);
    paint(s, 1, 6); // rival paint within reach so the first press is not refused
    for (let x = 9; x <= 11; x++) for (let y = 0; y <= 1; y++) if (!solidAt(s.grid.map, x, y)) paintTile(s.match, x, y, 1, 0);
    const f = new Feed();
    run(s, f, 1);
    give(s, 0, 'sponge');
    run(s, f, 1);
    run(s, f, 1, { 0: USE });
    expect(f.log.map((e) => e.type === 'fired' && e.kind)).toEqual(['sponge']);
    run(s, f, 400); // 5 s later it is lost (held empty, no press)
    expect(plus(s).sponge[0]).toBe(0);
    expect(s.match.sab!.held[0]).toBeNull();
    expect(f.log.filter((e) => e.type === 'fired')).toHaveLength(1);
  });

  it('a refused card (a stained body cannot play) logs nothing', () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    run(s, f, 1);
    give(s, 0, 'roller');
    s.match.bodies[0]!.stun = 30;
    run(s, f, 5, { 0: USE });
    expect(s.match.sab!.used).toBe(0);
    expect(f.log).toEqual([]);
  });
});

describe('the TV feed: score swings', () => {
  const total = (s: ManchazoState) => s.match.paintable;
  it(`a team gaining 1.5 pp in one tick is announced, 1 tile less is not`, () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    run(s, f, 2);
    const need = Math.ceil((1.5 / 100) * total(s));
    paint(s, 0, need - 1);
    run(s, f, 1);
    expect(f.log).toEqual([]);
    paint(s, 0, 1);
    run(s, f, 1);
    expect(f.log).toHaveLength(1);
    const e = f.log[0]!;
    expect(e.type === 'swing' && e.team).toBe(0);
    expect(e.type === 'swing' && e.pp).toBeGreaterThanOrEqual(1.5);
  });

  it('the same team waits SWING_COOL ticks for the next one; a slow climb never counts', () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    run(s, f, 1);
    const big = Math.ceil((2 / 100) * total(s));
    paint(s, 0, big);
    run(s, f, 1);
    paint(s, 0, big);
    run(s, f, SWING_COOL - 5);
    expect(f.log).toHaveLength(1);
    run(s, f, 10);
    expect(f.log.length).toBeGreaterThanOrEqual(1);
    const slow = plusRound([0, 1]);
    const g = new Feed();
    for (let k = 0; k < 400; k++) {
      if (k % 30 === 0) paint(slow, 1, 1); // 1 tile per 30 ticks: far below 1.5 pp per 60 ticks
      step(slow);
      g.observe(slow);
    }
    expect(g.log).toEqual([]);
  });

  it('the "+X %" is what a team gained in the last 2 s, not since the round began or since an old jump', () => {
    const s = plusRound([0, 1]);
    const f = new Feed();
    run(s, f, 1);
    paint(s, 0, Math.ceil((20 / 100) * total(s))); // a big early jump: about 20 pp
    run(s, f, 1);
    expect(f.gain(0)).toBeGreaterThan(19);
    run(s, f, 125); // a little over 2 s (120 ticks) of nothing: the jump leaves the window
    expect(f.gain(0)).toBe(0);
    paint(s, 0, Math.ceil((3 / 100) * total(s))); // a fresh +3
    run(s, f, 1);
    expect(f.gain(0)).toBeGreaterThan(2.9);
    expect(f.gain(0)).toBeLessThan(3.6); // 3 pp, not 23
    expect(f.gain(1)).toBe(0);
    const swing = f.log.filter((e) => e.type === 'swing').at(-1)!;
    expect(swing.type === 'swing' && swing.pp).toBeLessThan(3.6);
  });

  it('while the scoreboard is hidden (the last 10 s) no swing is announced', () => {
    const s = createManchazo({ slots: [0, 1], teams: [0, 1], seed: 5, sabotage: true, sabotagePlus: true, events: true });
    const f = new Feed();
    run(s, f, 1);
    s.grid.tick = s.grid.durationTicks - 300; // inside the hidden window
    expect(isHidden(s)).toBe(true);
    paint(s, 0, Math.ceil((5 / 100) * total(s)));
    run(s, f, 3);
    expect(f.log).toEqual([]);
  });
});

describe('the TV feed is only a reader: replay and mirror', () => {
  const CASES: [string, number[]][] = [
    ['4 even', [0, 1, 0, 1]],
    ['8 players', [0, 1, 0, 1, 0, 1, 0, 1]],
  ];
  const drive = (teams: number[], rs: number, flip: boolean, withFeed: boolean) => {
    const slots = teams.map((_t, i) => i);
    const s = createManchazo({ slots, teams: flip ? teams.map((t) => 1 - t) : teams, seed: 4, sabotage: true, sabotagePlus: true });
    s.grid.bodies.forEach((_b, i) => put(s, i, flip ? 26 - (10 + i) : 10 + i, 0));
    const f = new Feed();
    playUses(s, rs, 1800, flip, 30, (st) => {
      const a = st.match.sab!;
      const n = st.grid.bodies.length;
      if (st.grid.tick % 20 === 0) {
        const k = st.grid.tick / 20;
        const i = k % n;
        if (a.plus!.sponge[i] === 0 && (a.held[i] === null || k % 4 === 0))
          a.held[i] = PLUS_KINDS[(2 * Math.floor(k / n) + i) % PLUS_KINDS.length]!;
      }
      if (withFeed) f.observe(st);
    });
    return { s, f };
  };

  for (const [name, teams] of CASES) {
    it(`${name}: two runs give the same log hash, and observing never changes the sim's hash`, () => {
      const a = drive(teams, 101, false, true);
      const b = drive(teams, 101, false, true);
      const bare = drive(teams, 101, false, false);
      expect(a.f.log.length).toBeGreaterThan(5);
      expect(feedHash(a.f.log)).toBe(feedHash(b.f.log));
      expect(hashManchazo(a.s)).toBe(hashManchazo(bare.s)); // with and without the reader: bit for bit the same round
    });

    it(`${name}: the mirrored round gives the mirrored log (teams swapped, same ticks, cards and swings)`, () => {
      for (const rs of [101, 202, 303]) {
        const a = drive(teams, rs, false, true).f.log;
        const b = drive(teams, rs, true, true).f.log;
        const norm = (log: typeof a, flip: boolean) =>
          log.map((e) =>
            e.type === 'phase'
              ? [e.type, e.tick, e.phase, e.warn].join()
              : [
                  e.type,
                  e.tick,
                  flip ? 1 - e.team : e.team,
                  e.type === 'fired' ? `${e.body}/${e.kind}` : e.type === 'swing' ? e.pp.toFixed(3) : e.type,
                ].join(),
          );
        expect(a.length).toBeGreaterThan(0);
        expect(norm(b, true)).toEqual(norm(a, false));
      }
    });
  }
});
