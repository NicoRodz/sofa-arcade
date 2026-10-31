// The Cocina escuela session on the REAL sim: scripted chefs (schoolBot.ts) cook through the four steps with the same controls a phone sends.
import { describe, expect, it } from 'vitest';
import { type GameEvents, Emitter } from '../round/events';
import { TICK_MS, type Controls } from '../overcooked';
import type { ClientMsg } from '@pichi/core';
import { OVEN_SHOW_MS, REGRANT_MS, UNWANTED_MS, createSchool, type SchoolMember } from './school';
import { runSchool } from './school-bot';
import { SCHOOL_STEPS, SCHOOL_TOTAL } from './steps';

const chefs = (n: number, extra: Partial<SchoolMember> = {}): SchoolMember[] =>
  Array.from({ length: n }, (_v, i) => ({ id: i + 1, slot: i, connected: true, ...extra }));
type SchoolMsg = Extract<ClientMsg, { t: 'school' }>;
type HintMsg = Extract<ClientMsg, { t: 'hint' }>;
const schoolMsgs = (sent: ClientMsg[], id: number) => sent.filter((m): m is SchoolMsg => m.t === 'school' && m.playerId === id);
const hintMsgs = (sent: ClientMsg[], id: number) => sent.filter((m): m is HintMsg => m.t === 'hint' && m.playerId === id);
const idle: Controls = { x: 0, y: 0, a: 0, b: false };

describe('a chef alone goes through the four steps, in order', () => {
  const r = runSchool(chefs(1));
  it('finishes them all, one after the other, each strictly later than the one before', () => {
    expect(r.school.everyoneDone).toBe(true);
    const at = r.steps.get(1)!;
    expect(at).toHaveLength(SCHOOL_TOTAL);
    for (let i = 1; i < at.length; i++) expect(at[i]!, `step ${i}`).toBeGreaterThan(at[i - 1]!);
    expect(r.school.progressOf(1)).toEqual({ step: SCHOOL_TOTAL, skipped: false });
  });
  it('takes seconds, not minutes (the practice must not drag)', () => {
    expect(r.steps.get(1)!.at(-1)!).toBeLessThan(30_000);
  });
  it('the phone is told each step in turn, with the step number and the 8-word-max instruction, ending with "done"', () => {
    const msgs = schoolMsgs(r.sent, 1);
    const order = [...new Set(msgs.map((m) => m.step))];
    expect(order).toEqual([0, 1, 2, 3, 4]);
    for (const m of msgs) {
      expect(m.total).toBe(SCHOOL_TOTAL);
      if (m.step < SCHOOL_TOTAL) expect(m.text).toBe(SCHOOL_STEPS[m.step]!.text);
    }
    expect(msgs.at(-1)!.done).toBe(true);
    expect(msgs[0]!.btn).toBe('a');
    expect(msgs.at(-1)!.btn).toBe('b'); // done: B for the dash
  });
  it('the knife step lights B while the tomato is under the knife (not only A)', () => {
    const during = schoolMsgs(r.sent, 1).filter((m) => m.step === 1);
    expect(during.some((m) => m.btn === 'a')).toBe(true);
    expect(during.some((m) => m.btn === 'b')).toBe(true);
  });
  it('the contextual buttons work in the school: the hints name the real verbs', () => {
    const labels = new Set(hintMsgs(r.sent, 1).flatMap((h) => [h.a, h.b]));
    for (const l of ['Tomar masa', 'Tomar tomate', 'Picar', 'Al horno', 'Entregar']) expect(labels.has(l), l).toBe(true);
  });
});

describe('the hands and the wire', () => {
  it("the chopped tomato is in the chef's hands the very moment the chop is done, and the board is free again", () => {
    let seen = false;
    runSchool(chefs(1), {
      limitMs: 30_000,
      every: (_ms, sch) => {
        const p = sch.game.players.get(1)!;
        if (!seen && sch.progressOf(1)!.step === 2) {
          seen = true;
          expect(p.item).toBe('cut1');
          expect(sch.game.stations.filter((x) => x.kind === 'board').every((b) => b.item === null)).toBe(true);
        }
      },
    });
    expect(seen).toBe(true);
  });
  it('a chef that does nothing is told its step again every second (a phone that came back is right within a second), not every frame', () => {
    const r = runSchool(chefs(1), { idle: [1], limitMs: 5000, until: () => false });
    const n = schoolMsgs(r.sent, 1).length;
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(7);
  });
  it('a message that flaps every frame (the lit button flips while the board fills and empties) reaches the phone at most every 50 ms', () => {
    const sent: ClientMsg[] = [];
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: (m) => sent.push(m) });
    s.step(TICK_MS, chefs(1), () => idle);
    s.progressOf(1)!.step = 1; // (reach the knife step without cooking: the test only watches the wire)
    const p = s.game.players.get(1)!;
    const board = s.game.stations.find((x) => x.kind === 'board' && x.ty === 0)!;
    Object.assign(p, { x: board.tx + 0.5, y: 1.5, fx: 0, fy: -1 });
    sent.length = 0;
    for (let i = 0; i < 60; i++) {
      board.item = i % 2 ? 'raw1' : null;
      s.step(TICK_MS, chefs(1), () => idle);
    }
    const btns = schoolMsgs(sent, 1).map((m) => m.btn);
    expect(new Set(btns).size, 'it really did flip').toBe(2);
    expect(schoolMsgs(sent, 1).length, 'one second of flapping').toBeLessThanOrEqual(1000 / 50 + 2);
    expect(schoolMsgs(sent, 1).length).toBeGreaterThan(5);
  });
  it("when the school ends every phone gets the game's own button labels back", () => {
    const sent: ClientMsg[] = [];
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: (m) => sent.push(m) });
    for (let i = 0; i < 90; i++) s.step(TICK_MS, chefs(2), () => idle);
    expect(hintMsgs(sent, 1).length).toBeGreaterThan(0);
    sent.length = 0;
    s.dispose();
    for (const id of [1, 2]) expect(hintMsgs(sent, id)).toEqual([{ t: 'hint', playerId: id, a: null, b: null }]);
  });
});

describe('no clock, no score at stake', () => {
  it('five minutes of nobody doing anything: the round never ends and no order expires', () => {
    const events: string[] = [];
    const bus = new Emitter<GameEvents>();
    for (const t of ['roundEnd', 'orderExpired', 'orderWarning', 'orderNew', 'countdownTick', 'roundStart'] as const)
      bus.on(t, () => {
        events.push(t);
      });
    const r = runSchool(chefs(2), { idle: [1, 2], limitMs: 300_000, bus });
    expect(r.school.game.over).toBe(false);
    expect(r.school.game.time).toBeGreaterThan(299_000);
    expect(events).toEqual([]);
    expect(r.school.game.orders).toHaveLength(1);
    expect(r.school.game.orders[0]!.expiresAt).toBe(Infinity);
    expect(r.school.everyoneDone).toBe(false);
  }, 60_000);
  it('the window always has an order for the next pizza (a chef delivers, another still can)', () => {
    const r = runSchool(chefs(3));
    expect(r.school.everyoneDone).toBe(true);
    expect(r.school.game.orders).toHaveLength(1);
    expect(r.school.game.delivered).toBe(3);
  });
});

describe('every chef at its own pace', () => {
  for (const n of [2, 4, 8]) {
    it(`${n} chefs all finish, none is held back by another, and nobody gets stuck`, () => {
      const r = runSchool(chefs(n), { limitMs: 180_000 });
      expect(r.school.everyoneDone, `${n} chefs`).toBe(true);
      for (const id of chefs(n).map((c) => c.id)) expect(r.steps.get(id), `chef ${id}`).toHaveLength(SCHOOL_TOTAL);
      expect(r.school.rows().every((row) => row.done && !row.skipped)).toBe(true);
    }, 60_000);
  }
  it('a chef that stands still does not stop the other from finishing, and the table waits for it', () => {
    const r = runSchool(chefs(2), { idle: [2], limitMs: 60_000 });
    expect(r.steps.get(1)).toHaveLength(SCHOOL_TOTAL);
    expect(r.steps.get(2)).toBeUndefined();
    expect(r.school.everyoneDone).toBe(false);
    expect(schoolMsgs(r.sent, 1).at(-1)!.done).toBe(true); // the fast one is already done and practising the dash
    expect(schoolMsgs(r.sent, 2).at(-1)!.step).toBe(0);
  });
});

describe('a player that joins halfway', () => {
  it('starts at step 0 while the others are further on; the table is not done until they are', () => {
    const members = chefs(2);
    const seen: { ms: number; done: boolean }[] = [];
    const r = runSchool(members, {
      join: { 2: 20_000 },
      limitMs: 90_000,
      until: (ms, sc) => ms > 21_000 && sc.everyoneDone,
      every: (ms, s) => {
        if (Math.round(ms) % 5000 < TICK_MS) seen.push({ ms, done: s.everyoneDone });
      },
    });
    expect(r.steps.get(1)!.at(-1)!, 'the first chef is done long before the joiner arrives').toBeLessThan(20_000);
    expect(r.steps.get(2)![0]!, 'the joiner starts from step 0').toBeGreaterThan(20_000);
    expect(r.steps.get(2)).toHaveLength(SCHOOL_TOTAL);
    expect(r.school.everyoneDone).toBe(true);
    expect(
      seen.filter((s) => s.ms > 8000 && s.ms < 19_000).every((s) => s.done),
      'while only chef 1 was there it was "done"',
    ).toBe(true);
  });
  it('a joiner that arrives after everyone was done reopens the table', () => {
    const members = chefs(2);
    const r = runSchool(members, { join: { 2: 30_000 }, idle: [], limitMs: 25_000 });
    expect(r.school.everyoneDone).toBe(true); // chef 1 alone
    const s = r.school;
    const roster = chefs(2);
    s.step(TICK_MS, roster, () => idle);
    expect(s.everyoneDone).toBe(false);
    expect(s.doneMs).toBe(0);
  });
});

describe('skipping', () => {
  it('"Saltar" finishes that chef at once, wherever it was, and the others carry on', () => {
    const members = chefs(2);
    let skippedAt = -1,
      before = 0;
    const r = runSchool(members, {
      limitMs: 90_000,
      every: (ms, s) => {
        if (skippedAt < 0 && ms > 2000) {
          skippedAt = ms;
          before = s.progressOf(2)!.step;
          s.skip(2);
        }
      },
    });
    expect(r.school.progressOf(2)).toEqual({ step: SCHOOL_TOTAL, skipped: true });
    expect(r.school.progressOf(1)!.skipped).toBe(false);
    expect(r.school.everyoneDone).toBe(true);
    expect(before, 'chef 2 had not finished by then').toBeLessThan(SCHOOL_TOTAL - 1);
    expect(r.steps.get(2)).toHaveLength(before + 1); // ONE notification for the skip: straight to the end, no step by step
    expect(r.steps.get(2)!.at(-1)).toBeCloseTo(skippedAt, 0);
  });
  it('skipping everyone ends the table at once', () => {
    const members = chefs(3);
    const r = runSchool(members, {
      limitMs: 3000,
      every: (ms, s) => {
        if (ms > 1000) for (const m of members) s.skip(m.id);
      },
    });
    expect(r.school.everyoneDone).toBe(true);
  });
  it('a "Saltar" that arrives before the chef was first seen is not lost', () => {
    const notes: number[] = [];
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: () => {}, onAdvance: (id) => notes.push(id) });
    s.skip(1);
    s.step(TICK_MS, chefs(1), () => idle);
    expect(s.progressOf(1)).toEqual({ step: SCHOOL_TOTAL, skipped: true });
    expect(notes).toEqual([1]);
  });
  it('a chef that is done cannot be "skipped" again (no double notification)', () => {
    const r = runSchool(chefs(1));
    const n = r.steps.get(1)!.length;
    r.school.skip(1);
    expect(r.steps.get(1)).toHaveLength(n);
  });
  it('chefs whose phone already did the school start finished; with useKnown off (opened by hand) everybody practises', () => {
    const known = [
      { id: 1, slot: 0, connected: true, known: true },
      { id: 2, slot: 1, connected: true },
    ];
    const auto = createSchool({ bus: new Emitter<GameEvents>(), send: () => {} });
    auto.step(TICK_MS, known, () => idle);
    expect(auto.progressOf(1)).toEqual({ step: SCHOOL_TOTAL, skipped: true });
    expect(auto.progressOf(2)).toEqual({ step: 0, skipped: false });
    expect(schoolMsgs(runSchool(known).sent, 1)[0]!.text).toMatch(/Ya la hiciste/);
    expect(schoolMsgs(runSchool(known, { useKnown: false }).sent, 1).at(-1)!.text, 'it cooked it for real: no "ya la hiciste"').not.toMatch(
      /Ya la hiciste/,
    );
    const manual = createSchool({ bus: new Emitter<GameEvents>(), send: () => {}, useKnown: false });
    manual.step(TICK_MS, known, () => idle);
    expect(manual.progressOf(1)).toEqual({ step: 0, skipped: false });
  });
});

describe('Ayudante works the same', () => {
  it('a chef on Ayudante finishes with ONE tap of B per chop; the same taps chop nothing without it', () => {
    const helped = runSchool(chefs(1, { assist: true }), { tap: [1], limitMs: 60_000 });
    expect(helped.school.everyoneDone).toBe(true);
    expect(helped.school.game.players.get(1)!.assist).toBe(true);
    const plain = runSchool(chefs(1), { tap: [1], limitMs: 60_000 });
    expect(plain.school.everyoneDone).toBe(false);
    expect(plain.school.progressOf(1)!.step, 'stuck at the knife: taps do not chop').toBe(1);
  });
  it('the flag follows a chef that joins later', () => {
    const r = runSchool([...chefs(1), { id: 2, slot: 1, connected: true, assist: true }], { join: { 2: 5000 }, limitMs: 6000 });
    expect(r.school.game.players.get(1)!.assist).toBeUndefined();
    expect(r.school.game.players.get(2)!.assist).toBe(true);
  });
});

describe('the practice never leaves a chef stuck', () => {
  const stand = (n = 1) => {
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: () => {} });
    const roster = chefs(n);
    s.step(TICK_MS, roster, () => idle);
    return { s, roster };
  };
  const run = (s: ReturnType<typeof stand>['s'], roster: SchoolMember[], ms: number) => {
    for (let t = 0; t < ms; t += TICK_MS) s.step(TICK_MS, roster, () => idle);
  };
  it('what does not belong in the hands at this step goes away after a moment (the dough once it was taken)', () => {
    const { s, roster } = stand();
    const p = s.game.players.get(1)!;
    p.item = 'raw0';
    run(s, roster, 200);
    expect(p.item, 'dough is what step 0 wants').toBe('raw0');
    p.item = 'cut0';
    run(s, roster, UNWANTED_MS - 200);
    expect(p.item, 'not yet').toBe('cut0');
    run(s, roster, 400);
    expect(p.item).toBeNull();
  });
  it('a chef at the oven step that puts its chopped tomato down gets another one REGRANT_MS later, and still finishes', () => {
    let removedAt = -1,
      backAt = -1;
    const r = runSchool(chefs(1), {
      limitMs: 60_000,
      every: (ms, sch) => {
        const p = sch.game.players.get(1)!;
        if (removedAt < 0 && sch.progressOf(1)!.step === 2 && p.item === 'cut1') {
          removedAt = ms;
          p.item = null;
        } else if (removedAt >= 0 && backAt < 0 && p.item === 'cut1') backAt = ms;
      },
    });
    expect(removedAt).toBeGreaterThan(0);
    expect(backAt - removedAt).toBeGreaterThanOrEqual(REGRANT_MS - 1);
    expect(backAt - removedAt).toBeLessThan(REGRANT_MS + 100);
    expect(r.school.everyoneDone).toBe(true);
  });
  it("the pizza comes out of the oven in the chef's hands at once; if the chef loses it, another one appears REGRANT_MS later", () => {
    let atStep3 = -1,
      gotDish = -1,
      lostAt = -1,
      gotAgain = -1;
    runSchool(chefs(1), {
      limitMs: 60_000,
      every: (ms, sch) => {
        const p = sch.game.players.get(1)!,
          step = sch.progressOf(1)!.step;
        if (step === 3 && atStep3 < 0) atStep3 = ms;
        if (step === 3 && gotDish < 0 && p.item === 'dish') {
          gotDish = ms;
          lostAt = ms;
          p.item = null;
        } else if (lostAt >= 0 && gotAgain < 0 && p.item === 'dish') gotAgain = ms;
      },
    });
    expect(gotDish - atStep3, 'the same tick the oven step was done').toBeLessThan(TICK_MS * 2);
    expect(gotAgain - lostAt).toBeGreaterThanOrEqual(REGRANT_MS - 1);
    expect(gotAgain - lostAt).toBeLessThan(REGRANT_MS + 100);
  });
  it('an oven shows what a chef put in it for OVEN_SHOW_MS, then empties for the next chef', () => {
    let filledAt = -1,
      emptyAt = -1;
    runSchool(chefs(1), {
      limitMs: 60_000,
      until: (ms) => ms > 15_000,
      every: (ms, sch) => {
        const busy = sch.game.stations.some((o) => o.kind === 'pot' && o.inputs.length > 0);
        if (busy && filledAt < 0) filledAt = ms;
        else if (!busy && filledAt >= 0 && emptyAt < 0) emptyAt = ms;
      },
    });
    expect(filledAt).toBeGreaterThan(0);
    expect(emptyAt - filledAt).toBeGreaterThanOrEqual(OVEN_SHOW_MS - 1);
    expect(emptyAt - filledAt).toBeLessThan(OVEN_SHOW_MS + 100);
  });
  it('a chef that drops (phone gone) leaves the kitchen and keeps its progress for when it is back', () => {
    const members = chefs(2);
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: () => {} });
    s.step(TICK_MS, members, () => idle);
    s.skip(2);
    s.step(TICK_MS, [members[0]!, { ...members[1]!, connected: false }], () => idle);
    expect(s.game.players.has(2)).toBe(false);
    expect(s.rows().map((x) => x.id)).toEqual([1]);
    expect(s.everyoneDone, 'only chef 1 is connected and it is not done').toBe(false);
    s.step(TICK_MS, members, () => idle);
    expect(s.game.players.has(2)).toBe(true);
    expect(s.progressOf(2)).toEqual({ step: SCHOOL_TOTAL, skipped: true });
  });
});

describe('the table is done: how long, and the rows the TV draws', () => {
  it('doneMs grows only while everyone is done; rows list the connected chefs by slot with their step', () => {
    const members = chefs(3);
    const s = createSchool({ bus: new Emitter<GameEvents>(), send: () => {} });
    s.step(TICK_MS, members, () => idle);
    expect(s.rows().map((x) => [x.id, x.step, x.done])).toEqual([
      [1, 0, false],
      [2, 0, false],
      [3, 0, false],
    ]);
    expect(s.doneMs).toBe(0);
    for (const m of members) s.skip(m.id);
    for (let i = 0; i < 60; i++) s.step(TICK_MS, members, () => idle);
    expect(s.everyoneDone).toBe(true);
    expect(s.doneMs).toBeGreaterThan(900);
    expect(s.rows().every((x) => x.done && x.skipped)).toBe(true);
  });
});
