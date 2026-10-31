// Which Pizzas event triggers which sound: one entry per event of the kitchen sim (the mix itself lives in the platform's audio/recipes).
import type { Action, SfxId } from '@pichi/screen-kit/audio/recipes';
import type { GameEvents, MechEvent, MutateEvent, SurfaceEvent } from '../../sim/round/events';

const play = (id: SfxId): Action => ({ kind: 'play', id });
const chopKey = (p: { station: number }) => `chop:${p.station}`;
const washKey = (p: { station: number }) => `wash:${p.station}`;
const ovenKey = (p: { station: number }) => `oven:${p.station}`;
const fireKey = (p: { station: number }) => `fire:${p.station}`;
const douseKey = (p: { station: number }) => `douse:${p.station}`;
const foldKey = (p: { station: number }) => `fold:${p.station}`;

// One entry per game event; the mapped type makes a missing event a compile error.
export const ACTIONS: { [K in Exclude<keyof GameEvents, SurfaceEvent | MutateEvent | MechEvent>]: (p: GameEvents[K]) => Action[] } = {
  itemPicked: () => [play('pickup')],
  itemDropped: () => [play('drop')],
  interactInvalid: () => [play('buzz')],
  dash: () => [play('whoosh')],
  bump: () => [play('thud')],
  chopStart: (p) => [{ kind: 'loopStart', key: chopKey(p), loop: 'chop' }],
  chopStop: (p) => [{ kind: 'loopStop', key: chopKey(p) }],
  chopDone: (p) => [{ kind: 'loopStop', key: chopKey(p) }, play('ding')],
  washStart: (p) => [{ kind: 'loopStart', key: washKey(p), loop: 'wash' }],
  washStop: (p) => [{ kind: 'loopStop', key: washKey(p) }],
  washDone: () => [play('plink')], // the scrubbing loop keeps going for the next plate while B is held
  dirtyNew: () => [play('clink')],
  potStart: (p) => [play('ovenOn'), { kind: 'loopStart', key: ovenKey(p), loop: 'oven' }],
  potReady: (p) => [{ kind: 'loopStop', key: ovenKey(p) }, play('ready')],
  orderNew: () => [play('orderNew')],
  orderWarning: () => [play('warn')],
  orderExpired: () => [play('expired')],
  // R7: the delivery chime climbs a whole tone per step of the tip multiplier (x1 plain, x4 six semitones up)
  delivered: (p) => [{ kind: 'play', id: 'deliver', semis: (p.mult - 1) * 2 }, { kind: 'duck' }],
  dishRejected: () => [play('expired')],
  streak: () => [],
  countdownTick: (p) => (p.kind === 'end' ? (p.n >= 1 && p.n <= 10 ? [play('tickEnd')] : []) : [play(p.n > 0 ? 'count' : 'go')]),
  roundStart: () => [], // the music follows the game snapshot; the "go" sound comes with countdown 0
  // versus: after the whistle, a fanfare when a team won and a plain close when it did not (a draw, or the host went on without a winner)
  roundEnd: (p) => [
    { kind: 'stopLoops' },
    play('whistle'),
    ...(p.winner === undefined ? [] : [play(p.winner === null ? 'tieJingle' : 'fanfare')]),
  ],
  // versus events
  vipNew: () => [play('vipNew')],
  vipWon: () => [play('vipWon'), { kind: 'duck' }],
  vipLost: () => [play('vipLost')],
  comeback: () => [play('comeback')],
  pantryRefill: () => [play('plink')], // a unit is back in the shared pantry
  teamK: (p) => (p.k > 1 ? [play('advantage')] : []), // only a handicap that grew is news; it going back to 1 is silent
  playerDropped: () => [play('playerDropped')],
  playerBack: () => [play('playerBack')],
  playerGone: () => [play('playerGone')],
  matchPaused: () => [play('paused')],
  matchResumed: () => [play('resumed')],
  // sabotage: a bag is ready, the reticle ticks, the throw, the impact (or the catch, or the burst), the slip and the laugh of the other side, the cleaning
  'sabotage:bagReady': () => [play('bagReady')],
  'sabotage:aim': () => [play('aimTick')],
  'sabotage:launch': () => [play('launch')],
  'sabotage:land': () => [play('land')],
  'sabotage:caught': () => [play('caught')],
  'sabotage:burst': () => [play('burst')],
  'sabotage:blocked': () => [play('buzz')],
  'chef:slip': () => [play('slip'), play('laugh')],
  'chef:recover': () => [],
  'trash:picked': () => [play('rustle')],
  'trash:binned': () => [play('clean')],
  'trash:decayed': () => [play('fizz')],
  // the oven that burns: the warning beep, the burnt pizza, the fire (with its crackle until it goes out), the extinguisher, the rescue
  'oven:warn': () => [play('ovenWarn')],
  'oven:burnt': () => [play('burnt')],
  'oven:rescued': () => [play('rescued')],
  'fire:start': (p) => [play('fireStart'), { kind: 'loopStart', key: fireKey(p), loop: 'blaze' }],
  'fire:spread': (p) => [play('fireSpread'), { kind: 'loopStart', key: fireKey(p), loop: 'blaze' }],
  'fire:out': (p) => [{ kind: 'loopStop', key: fireKey(p) }, { kind: 'loopStop', key: douseKey(p) }, play('fireOut')],
  'fire:end': () => [],
  douseStart: (p) => [{ kind: 'loopStart', key: douseKey(p), loop: 'douse' }],
  douseStop: (p) => [{ kind: 'loopStop', key: douseKey(p) }],
  // the calzone: thumps while the dough is folded, a whump when it is
  foldStart: (p) => [{ kind: 'loopStart', key: foldKey(p), loop: 'fold' }],
  foldStop: (p) => [{ kind: 'loopStop', key: foldKey(p) }],
  foldDone: (p) => [{ kind: 'loopStop', key: foldKey(p) }, play('folded')],
  // mid-round events: the siren when it is announced, a sting of its own when it starts, the power coming back, the inspector's verdict, the rat
  'event:announce': () => [play('siren')],
  'event:start': (p) =>
    p.kind === 'rush'
      ? [play('rushStart')]
      : p.kind === 'inspector'
        ? [play('inspectorStart')]
        : p.kind === 'blackout'
          ? [play('blackoutStart')]
          : p.kind === 'birthday'
            ? [play('birthday')]
            : [], // the rat has its own sound (rat:appear)
  'event:end': (p) => (p.kind === 'blackout' ? [play('blackoutEnd')] : []),
  'event:inspector': (p) => [play(p.passed ? 'inspectorPass' : 'inspectorFail')],
  'rat:appear': () => [play('ratAppear')],
  'rat:steal': () => [play('ratSteal')],
  'rat:scared': (p) => (p.bonus ? [play('ratScared'), play('ding')] : [play('ratScared')]), // the prize for scaring the gentle rat is a ding
  'rat:target': () => [play('ratTarget')],
  'rat:near': () => [play('ratNear')],
  'rat:gone': () => [],
};
