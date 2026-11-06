// Pure sound design of "Obstaculos en cadena": which sounds an obst.* event asks for (cuesFor) and what each is made of
// (voicesFor). No Web Audio here; synth.ts renders the voices. Plan §14.
import { MAX_FALL, type Biome, type CampaignEvents, type ObstEvents } from '../../index';
import { degreeFreq, slotFreq } from './scales';

export * from './recipe-types';
export { cueDuration, voicesFor } from './voices';
import { BIOME_SURFACE, LAND_MIN_IMPACT, type Cue, type Cues, type Params, type RecipeId, type Surface } from './recipe-types';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const impactLevel = (impact: number): number => clamp01(impact / MAX_FALL);
const cue = (recipe: RecipeId, key: string, priority: Cue['priority'], p: Params = {}, duck = false): Cue => ({
  recipe,
  key,
  priority,
  p,
  ...(duck ? { duck } : {}),
});

type Handlers = { [K in keyof ObstEvents]: (p: ObstEvents[K], biome: Biome) => Cues };
// One entry per event; the mapped type makes a missing event a compile error.
export const HANDLERS: Handlers = {
  'obst.jump': (p, b) => [
    cue(p.kind === 'trampoline' ? 'boing' : 'jump', `jump:${p.player}`, 2, { freq: slotFreq(b, p.player), variant: p.kind }),
  ],
  'obst.land': (p, b) => {
    if (p.impact < LAND_MIN_IMPACT) return [];
    const surface: Surface = p.on === 'head' ? 'thud' : p.on === 'oneWay' ? 'wood' : BIOME_SURFACE[b];
    return [cue('land', `land:${p.player}`, 1, { surface, level: impactLevel(p.impact) })];
  },
  'obst.ropeTaut': (p) => [cue('ropeTaut', `rope:${p.rope}:${p.link}`, 1, { tension: p.tension, level: p.link })],
  'obst.ropeStrain': (p) => [cue('ropeStrain', `strain:${p.rope}`, 1, { tension: p.tension })],
  'obst.grab': (p) => [
    cue(
      p.target === 'ring' ? 'grabRing' : p.target === 'player' ? 'grabPlayer' : p.target === 'box' ? 'grabBox' : 'grabLever',
      `grab:${p.player}`,
      1,
    ),
  ],
  'obst.release': (p) => [cue('release', `release:${p.player}`, 0)],
  'obst.throw': (p) => [cue('throw', `throw:${p.player}`, 1, { level: clamp01(Math.hypot(p.vx, p.vy) / 1200) })],
  'obst.handCatch': (p) => [cue('handCatch', `catch:${p.player}`, 2)],
  'obst.death': (p, b) => [cue('death', `death:${p.player}`, 3, { variant: p.cause, freq: slotFreq(b, p.player) })],
  'obst.bubble': (p) => [cue('bubble', `bubble:${p.player}`, 1, { variant: p.reason })],
  'obst.respawn': (p, b) => [cue('respawn', `respawn:${p.player}`, 2, { variant: p.via, freq: slotFreq(b, p.player) })],
  'obst.checkpoint': (_p, b) => [cue('checkpoint', 'checkpoint', 2, { notes: [1, 3, 5, 8].map((d) => degreeFreq(b, d, 1)) }, true)],
  'obst.star': (p, b) => [
    cue('star', `star:${p.player}`, 2, { freq: degreeFreq(b, 5 + Math.min(Math.max(p.streak, 1) - 1, 7), 1), level: p.streak }),
  ],
  'obst.plate': (p) => [cue('plate', `plate:${p.id}`, 1, { variant: p.pressed ? 'down' : 'up', level: clamp01(p.weight / 4) })],
  'obst.gate': (p) => [cue('gate', `gate:${p.id}`, 1, { variant: p.open ? 'open' : 'shut' })],
  'obst.goalEnter': (p, b) => {
    const out: Cues = [cue('goalEnter', `goal:${p.player}`, 2, { freq: slotFreq(b, p.player) })];
    if (p.total > 0 && p.inside >= p.total)
      out.push(cue('fanfare', 'goalAll', 3, { notes: [1, 5, 8, 10, 12].map((d) => degreeFreq(b, d, 1)), variant: 'gold' }, true));
    return out;
  },
  'obst.levelClear': (p, b) => {
    const len = p.medal === 'gold' ? 5 : p.medal === 'silver' ? 4 : 3;
    return [
      cue(
        'fanfare',
        'clear',
        3,
        { notes: [1, 3, 5, 8, 10].slice(0, len).map((d) => degreeFreq(b, d, 1)), variant: p.medal, level: p.stars / 3 },
        true,
      ),
    ];
  },
  'obst.runEnd': (p, b) => [
    p.reason === 'complete'
      ? cue('runWin', 'runEnd', 3, { notes: [1, 3, 5, 8, 10, 12].map((d) => degreeFreq(b, d, 1)) }, true)
      : cue('runFail', 'runEnd', 3, { freq: degreeFreq(b, 1, 1) }, true),
  ],
};

// Campaign A5 (plan §4 #4-#9): ONE effect per dynamic, built from the same voices as the rest. The older campaign events (signal, countdown, superJump, edgeAssist,
// heartsOut) have no sound yet (the screen shows banners for them), so this map is partial on purpose.
export type CampaignSound =
  | 'obst.balance'
  | 'obst.target'
  | 'obst.enemy'
  | 'obst.ice'
  | 'obst.wind'
  | 'obst.pickaxe'
  | 'obst.lantern'
  | 'obst.bungee'
  | 'obst.sinker'
  | 'obst.geyser';
type CampaignHandlers = { [K in CampaignSound]: (p: CampaignEvents[K], biome: Biome) => Cues };
const PICK_FREQ = { take: 1400, pass: 1800, climb: 2200, top: 2800 } as const;
export const CAMPAIGN_HANDLERS: CampaignHandlers = {
  'obst.balance': (p) => [cue('balance', `balance:${p.id}`, 1)], // wood creaking as the plates swap
  'obst.target': (p, b) => [cue('target', `target:${p.id}`, 2, { freq: degreeFreq(b, 8, 2) })], // a bright ting
  'obst.enemy': (p) => [cue('enemy', `enemy:${p.enemy}`, 1, { variant: p.action })], // squish when stunned, thud when it shoves
  'obst.ice': (p) => [cue('ice', `ice:${p.player}`, 0)], // glassy tick, the lowest priority: it rings at every step onto ice
  'obst.wind': (p) => (p.phase === 'calm' ? [] : [cue('wind', 'wind', 1, { variant: p.phase })]), // a whoosh at the warning and a stronger one with the gust
  'obst.pickaxe': (p) => [cue('pickaxe', `pick:${p.player}`, 1, { freq: PICK_FREQ[p.action], variant: p.action })], // steel tink, higher the further the action goes
  // A6: the crystals ring a glassy chord when the lantern lights them and sigh when it leaves; a rubber twang for the bungee; a low glug for the rock; the geyser bubbles, then roars
  'obst.lantern': (p, b) => [
    cue('lantern', `lantern:${p.action}`, p.action === 'light' ? 2 : 1, {
      freq: degreeFreq(b, p.action === 'light' ? 5 : 3, 2),
      variant: p.action,
    }),
  ],
  'obst.bungee': (p) => [cue('bungee', `bungee:${p.player}`, 1, { level: clamp01((p.stretch - 1.25) / 0.35) })],
  'obst.sinker': (p) => [cue('sinker', `sinker:${p.id}`, 1, { level: clamp01(p.load / 3) })],
  'obst.geyser': (p) => (p.phase === 'calm' ? [] : [cue('geyser', `geyser:${p.id}`, p.phase === 'gush' ? 2 : 1, { variant: p.phase })]),
};
export type SoundEvents = ObstEvents & Pick<CampaignEvents, CampaignSound>;
const ALL_HANDLERS = { ...HANDLERS, ...CAMPAIGN_HANDLERS } as { [K in keyof SoundEvents]: (p: SoundEvents[K], biome: Biome) => Cues };
export const SOUND_EVENTS = Object.keys(ALL_HANDLERS) as (keyof SoundEvents)[];

/** Which sounds an event asks for. Pure and total over the event names (the quick match's and the campaign's A5). */
export function cuesFor<K extends keyof ObstEvents>(name: K, payload: ObstEvents[K], biome: Biome): Cue[];
export function cuesFor<K extends CampaignSound>(name: K, payload: CampaignEvents[K], biome: Biome): Cue[];
export function cuesFor(name: keyof SoundEvents, payload: unknown, biome: Biome): Cue[] {
  return (ALL_HANDLERS[name] as (p: unknown, b: Biome) => Cues)(payload, biome).filter((c): c is Cue => c !== null);
}
