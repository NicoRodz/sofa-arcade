import { describe, expect, it } from 'vitest';
import { ACTIONS, LOOPS, SFX, sfxDuration, type Action } from './recipes';

const ids = (a: Action[]) => a.map((x) => (x.kind === 'play' ? x.id : x.kind));

describe('event -> sound mapping', () => {
  it('grab, drop and invalid map to their sounds', () => {
    expect(ids(ACTIONS.itemPicked({ player: 1, item: 'raw0', from: 'crate' }))).toEqual(['pickup']);
    expect(ids(ACTIONS.itemDropped({ player: 1, item: 'raw0', at: 'counter' }))).toEqual(['drop']);
    expect(ids(ACTIONS.interactInvalid({ player: 1 }))).toEqual(['buzz']);
  });
  it('chopping loops per station while held and ends with a ding', () => {
    expect(ACTIONS.chopStart({ player: 1, station: 4 })).toEqual([{ kind: 'loopStart', key: 'chop:4', loop: 'chop' }]);
    expect(ACTIONS.chopStop({ player: 1, station: 4 })).toEqual([{ kind: 'loopStop', key: 'chop:4' }]);
    expect(ACTIONS.chopDone({ player: 1, station: 4 })).toEqual([
      { kind: 'loopStop', key: 'chop:4' },
      { kind: 'play', id: 'ding' },
    ]);
  });
  it('washing: a splash loop per sink while B is held, a plink per clean plate, a clink when a dirty one arrives', () => {
    expect(ACTIONS.washStart({ player: 1, station: 7 })).toEqual([{ kind: 'loopStart', key: 'wash:7', loop: 'wash' }]);
    expect(ACTIONS.washStop({ player: 1, station: 7 })).toEqual([{ kind: 'loopStop', key: 'wash:7' }]);
    expect(ids(ACTIONS.washDone({ player: 1, station: 7 }))).toEqual(['plink']);
    expect(ids(ACTIONS.dirtyNew({ station: 5 }))).toEqual(['clink']);
    expect(LOOPS.wash.every(0.5)).toBe(0.2);
  });
  it('oven: start plays the swell and loops crackle until ready', () => {
    expect(ACTIONS.potStart({ station: 2 })).toEqual([
      { kind: 'play', id: 'ovenOn' },
      { kind: 'loopStart', key: 'oven:2', loop: 'oven' },
    ]);
    expect(ACTIONS.potReady({ station: 2 })).toEqual([
      { kind: 'loopStop', key: 'oven:2' },
      { kind: 'play', id: 'ready' },
    ]);
  });
  it('the calzone: a kneading loop per oven while Picar is held, and a whump when it is folded', () => {
    expect(ACTIONS.foldStart({ player: 1, station: 3 })).toEqual([{ kind: 'loopStart', key: 'fold:3', loop: 'fold' }]);
    expect(ACTIONS.foldStop({ player: 1, station: 3 })).toEqual([{ kind: 'loopStop', key: 'fold:3' }]);
    expect(ACTIONS.foldDone({ player: 1, station: 3 })).toEqual([
      { kind: 'loopStop', key: 'fold:3' },
      { kind: 'play', id: 'folded' },
    ]);
    expect(LOOPS.fold.sfx).toBe('knead');
    expect(sfxDuration('folded')).toBeGreaterThan(0.3);
  });
  it('orders and delivery; only a delivery ducks the music', () => {
    expect(ids(ACTIONS.orderNew({ order: 1, recipe: 'marinara' }))).toEqual(['orderNew']);
    expect(ids(ACTIONS.orderWarning({ order: 1 }))).toEqual(['warn']);
    expect(ids(ACTIONS.orderExpired({ order: 1 }))).toEqual(['expired']);
    expect(ids(ACTIONS.delivered({ player: 1, points: 70, tip: 0, base: 70, mult: 1 }))).toEqual(['deliver', 'duck']);
  });
  it('R7: the delivery chime climbs two semitones per step of the tip multiplier; a lost dish and a lost streak have their own sound', () => {
    const semis = (mult: number) => (ACTIONS.delivered({ player: 1, points: 0, tip: 0, base: 70, mult })[0] as { semis: number }).semis;
    expect([1, 2, 3, 4].map(semis)).toEqual([0, 2, 4, 6]);
    expect(ids(ACTIONS.dishRejected({ player: 1 }))).toEqual(['expired']);
    expect(ids(ACTIONS.dash({ player: 1, dx: 1, dy: 0 }))).toEqual(['whoosh']);
    expect(ids(ACTIONS.bump({ player: 1, other: 2 }))).toEqual(['thud']);
  });
  it('countdown: 3-2-1 beep, 0 is "go", the last 10 s tick', () => {
    expect(ids(ACTIONS.countdownTick({ n: 3, kind: 'start' }))).toEqual(['count']);
    expect(ids(ACTIONS.countdownTick({ n: 1, kind: 'start' }))).toEqual(['count']);
    expect(ids(ACTIONS.countdownTick({ n: 0, kind: 'start' }))).toEqual(['go']);
    expect(ids(ACTIONS.countdownTick({ n: 10, kind: 'end' }))).toEqual(['tickEnd']);
    expect(ids(ACTIONS.countdownTick({ n: 0, kind: 'end' }))).toEqual([]);
  });
  it('round end stops every loop and blows the whistle; round start is silent by itself', () => {
    expect(ids(ACTIONS.roundEnd({ score: 0, delivered: 0 }))).toEqual(['stopLoops', 'whistle']);
    expect(ACTIONS.roundStart({})).toEqual([]);
  });
});

describe('versus sounds (F4)', () => {
  it('the golden order: a shimmer when it shows up, a fanfare (and a duck) for the team that wins it, a dull slide for the one that loses it', () => {
    expect(ids(ACTIONS.vipNew({ recipe: 'marinara' }))).toEqual(['vipNew']);
    expect(ids(ACTIONS.vipWon({ team: 0, player: 1, tie: false }))).toEqual(['vipWon', 'duck']);
    expect(ids(ACTIONS.vipLost({ team: 1 }))).toEqual(['vipLost']);
    expect(Math.min(...SFX.vipLost.voices.map((v) => v.at))).toBeGreaterThan(0.2); // it lands after the winner's arpeggio, not on top of it
  });
  it('the handicap: only a bigger k is news (a chef of that kitchen dropped); back to 1 is silent', () => {
    expect(ids(ACTIONS.teamK({ team: 1, k: 1.22 }))).toEqual(['advantage']);
    expect(ACTIONS.teamK({ team: 1, k: 1 })).toEqual([]);
  });
  it('a chef dropping, coming back, leaving for good and the pause each have their own sound', () => {
    expect(ids(ACTIONS.playerDropped({ player: 1, team: 0 }))).toEqual(['playerDropped']);
    expect(ids(ACTIONS.playerBack({ player: 1, team: 0 }))).toEqual(['playerBack']);
    expect(ids(ACTIONS.playerGone({ player: 1, team: 0 }))).toEqual(['playerGone']);
    expect(ids(ACTIONS.matchPaused({ teams: [1] }))).toEqual(['paused']);
    expect(ids(ACTIONS.matchResumed({}))).toEqual(['resumed']);
  });
  it('the comeback and a unit back in the pantry', () => {
    expect(ids(ACTIONS.comeback({ team: 1 }))).toEqual(['comeback']);
    expect(ids(ACTIONS.pantryRefill({ stock: 2 }))).toEqual(['plink']);
  });
  it('the end of a versus round: the whistle, then a fanfare for a winner or a plain close for a draw; coop keeps its whistle alone', () => {
    const end = (winner?: number | null) => ids(ACTIONS.roundEnd({ score: 10, delivered: 1, ...(winner === undefined ? {} : { winner }) }));
    expect(end(0)).toEqual(['stopLoops', 'whistle', 'fanfare']);
    expect(end(1)).toEqual(['stopLoops', 'whistle', 'fanfare']);
    expect(end(null)).toEqual(['stopLoops', 'whistle', 'tieJingle']);
    expect(end()).toEqual(['stopLoops', 'whistle']);
  });
  it('the fanfare and the close come after the whistle (0.7 s), so they never mask it', () => {
    for (const id of ['fanfare', 'tieJingle'] as const)
      expect(Math.min(...SFX[id].voices.map((v) => v.at)), id).toBeGreaterThanOrEqual(sfxDuration('whistle'));
    expect(sfxDuration('fanfare')).toBeGreaterThan(2.5);
  });
});

describe('recipes', () => {
  it('every voice has a positive duration and a gain in (0, 1]', () => {
    for (const [id, s] of Object.entries(SFX))
      for (const v of s.voices) {
        expect(v.dur, id).toBeGreaterThan(0);
        expect(v.gain, id).toBeGreaterThan(0);
        expect(v.gain, id).toBeLessThanOrEqual(1);
      }
  });
  it('durations follow the spec table', () => {
    expect(sfxDuration('pickup')).toBeCloseTo(0.04);
    expect(sfxDuration('deliver')).toBeCloseTo(1.2);
    expect(sfxDuration('whistle')).toBeCloseTo(0.7);
    expect(sfxDuration('ready')).toBeCloseTo(0.8);
  });
  it('loop cadence: chop 250 ms, oven ~8 clicks/s', () => {
    expect(LOOPS.chop.every(0.5)).toBe(0.25);
    expect(1 / LOOPS.oven.every(0.5)).toBeGreaterThan(7);
    expect(1 / LOOPS.oven.every(0.5)).toBeLessThan(10);
  });
});

describe('sabotage sounds', () => {
  it('each sabotage event has its sound: the throw climbs, the impact and the burst are different, the slip is followed by the laugh of the other side', () => {
    expect(ids(ACTIONS['sabotage:bagReady']({ team: 0, bags: 1 }))).toEqual(['bagReady']);
    expect(ids(ACTIONS['sabotage:aim']({ team: 0, player: 1, at: [9, 2] }))).toEqual(['aimTick']);
    expect(ids(ACTIONS['sabotage:launch']({ team: 0, player: 1, from: [5, 8], landAt: [11, 3], ms: 700 }))).toEqual(['launch']);
    expect(ids(ACTIONS['sabotage:land']({ team: 0, target: 1, tile: [11, 3], double: false, extra: null }))).toEqual(['land']);
    expect(ids(ACTIONS['sabotage:burst']({ team: 0, at: [5, 8] }))).toEqual(['burst']);
    expect(ids(ACTIONS['sabotage:caught']({ team: 0, target: 1, chef: 3 }))).toEqual(['caught']);
    expect(ids(ACTIONS['sabotage:blocked']({ team: 0, player: 1, why: 'cooldown' }))).toEqual(['buzz']);
    expect(ids(ACTIONS['chef:slip']({ chef: 3, team: 1, at: [11, 3], dir: [1, 0], dist: 2.5, dropped: null }))).toEqual(['slip', 'laugh']);
    expect(ids(ACTIONS['trash:binned']({ team: 1, desechos: 1, gained: 1, item: 'trash' }))).toEqual(['clean']);
    expect(ids(ACTIONS['trash:picked']({ player: 3, team: 1, tile: [11, 3], item: 'trash', kind: 'trash' }))).toEqual(['rustle']);
    expect(ids(ACTIONS['chef:recover']({ chef: 3, team: 1, wall: false }))).toEqual([]);
    expect(ids(ACTIONS['trash:decayed']({ team: 1, tile: [11, 3] }))).toEqual(['fizz']);
  });
  it('the laugh comes after the fall has started, the whoosh of the throw is a rising sweep, the impact is short', () => {
    expect(Math.min(...SFX.laugh.voices.map((v) => v.at))).toBeGreaterThanOrEqual(0.3);
    expect(SFX.laugh.voices).toHaveLength(4);
    const sweep = SFX.launch.voices.find((v) => v.src === 'sine')!;
    expect(sweep.f1!).toBeGreaterThan(sweep.f0! * 3);
    const fall = SFX.slip.voices.find((v) => v.src === 'triangle')!;
    expect(fall.f1!).toBeLessThan(fall.f0! / 4);
    expect(sfxDuration('land')).toBeLessThan(0.25);
    expect(sfxDuration('aimTick')).toBeLessThan(0.05);
  });
});

describe('burn sounds', () => {
  it('each burn event has its sound: the warning is an alarm of its own, the burnt pizza sizzles, the fire ignites and crackles until it is put out', () => {
    expect(ids(ACTIONS['oven:warn']({ station: 5, msLeft: 3000 }))).toEqual(['ovenWarn']);
    expect(ids(ACTIONS['oven:burnt']({ station: 5 }))).toEqual(['burnt']);
    expect(ids(ACTIONS['oven:rescued']({ player: 1, station: 5 }))).toEqual(['rescued']);
    expect(ACTIONS['fire:start']({ station: 5 })).toEqual([
      { kind: 'play', id: 'fireStart' },
      { kind: 'loopStart', key: 'fire:5', loop: 'blaze' },
    ]);
    expect(ACTIONS['fire:spread']({ station: 6 })).toEqual([
      { kind: 'play', id: 'fireSpread' },
      { kind: 'loopStart', key: 'fire:6', loop: 'blaze' },
    ]);
    expect(ACTIONS['fire:out']({ player: 1, station: 5 })).toEqual([
      { kind: 'loopStop', key: 'fire:5' },
      { kind: 'loopStop', key: 'douse:5' },
      { kind: 'play', id: 'fireOut' },
    ]);
    expect(ACTIONS['fire:end']({})).toEqual([]);
  });
  it('the extinguisher hisses in a loop while Picar is held in front of a fire (and has nothing to do with the chop loop)', () => {
    expect(ACTIONS.douseStart({ player: 1, station: 5 })).toEqual([{ kind: 'loopStart', key: 'douse:5', loop: 'douse' }]);
    expect(ACTIONS.douseStop({ player: 1, station: 5 })).toEqual([{ kind: 'loopStop', key: 'douse:5' }]);
    expect(LOOPS.douse.sfx).toBe('hiss');
    expect(LOOPS.blaze.max).toBeGreaterThan(1);
  });
  it('the warning is not the order warning: more notes, higher, and it repeats; a fire out has the relieved notes after the hiss', () => {
    expect(SFX.ovenWarn.voices.length).toBeGreaterThan(SFX.warn.voices.length);
    expect(Math.max(...SFX.ovenWarn.voices.map((v) => v.f0 ?? 0))).toBeGreaterThan(1500);
    expect(Math.min(...SFX.fireOut.voices.filter((v) => v.src === 'sine').map((v) => v.at))).toBeGreaterThanOrEqual(0.3);
    expect(sfxDuration('fireStart')).toBeGreaterThan(sfxDuration('fireSpread') * 1.5);
  });
});

describe('mid-round event sounds', () => {
  it('the announcement is a siren; each event then has a sting of its own, the rat has no sting (it squeaks when it shows up)', () => {
    expect(ids(ACTIONS['event:announce']({ kind: 'rush', inMs: 3000 }))).toEqual(['siren']);
    const start = (kind: 'rush' | 'inspector' | 'blackout' | 'birthday' | 'rat') => ids(ACTIONS['event:start']({ kind, durationMs: 1000 }));
    expect([start('rush'), start('inspector'), start('blackout'), start('birthday'), start('rat')]).toEqual([
      ['rushStart'],
      ['inspectorStart'],
      ['blackoutStart'],
      ['birthday'],
      [],
    ]);
    expect(ids(ACTIONS['rat:appear']({ at: [2, 3] }))).toEqual(['ratAppear']);
  });
  it('the power comes back with its own sound; no other event ends with one', () => {
    expect(ids(ACTIONS['event:end']({ kind: 'blackout' }))).toEqual(['blackoutEnd']);
    for (const kind of ['rush', 'inspector', 'birthday', 'rat'] as const) expect(ACTIONS['event:end']({ kind })).toEqual([]);
  });
  it("the inspector's verdict: a coin arpeggio that climbs when it passes, a sad slide that falls when it does not", () => {
    expect(ids(ACTIONS['event:inspector']({ passed: true, points: 100 }))).toEqual(['inspectorPass']);
    expect(ids(ACTIONS['event:inspector']({ passed: false, points: 0 }))).toEqual(['inspectorFail']);
    const up = SFX.inspectorPass.voices.filter((v) => v.src === 'triangle').map((v) => v.f0!);
    expect([...up].sort((a, b) => a - b)).toEqual(up);
    const slide = SFX.inspectorFail.voices.at(-1)!;
    expect(slide.f1!).toBeLessThan(slide.f0! / 1.5);
  });
  it('the rat: a grab and a scare are different squeaks; the scare falls fast and a stolen item is a small pop', () => {
    expect(ids(ACTIONS['rat:steal']({ station: 4, item: 'raw1' }))).toEqual(['ratSteal']);
    expect(ids(ACTIONS['rat:scared']({ player: 1, returned: true }))).toEqual(['ratScared']);
    expect(ACTIONS['rat:gone']({ stolen: true })).toEqual([]);
    expect(ids(ACTIONS['rat:scared']({ player: 1, returned: false, bonus: 50 }))).toEqual(['ratScared', 'ding']); // the gentle rat pays: a ding after the squeak
    expect(ids(ACTIONS['rat:target']({ station: 4 }))).toEqual(['ratTarget']);
    expect(ids(ACTIONS['rat:near']({ station: 4 }))).toEqual(['ratNear']);
    expect(SFX.ratNear.voices).toHaveLength(3); // three blips, the urgent one
    expect(sfxDuration('ratTarget')).toBeLessThan(0.4);
    const squeak = SFX.ratScared.voices.find((v) => v.src === 'sine')!;
    expect(squeak.f1!).toBeLessThan(squeak.f0! / 2);
    expect(sfxDuration('ratSteal')).toBeLessThan(0.2);
  });
  it('the blackout is a power-down: a sawtooth that falls, and a thud after it', () => {
    const down = SFX.blackoutStart.voices[0]!;
    expect(down.f1!).toBeLessThan(down.f0! / 4);
    expect(Math.max(...SFX.blackoutStart.voices.map((v) => v.at))).toBeGreaterThan(0.4);
    expect(sfxDuration('birthday')).toBeGreaterThan(1.2);
  });
});
