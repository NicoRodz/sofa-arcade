// Offline loudness check in a browser (no ears needed): renders cues and music through the real chain on an
// OfflineAudioContext and prints peak / rms / duration. Run: bash screen/src/games/obstaculos/audio/measure/run.sh
import { BIOMES, type Biome, type ObstEvents } from '../../../index';
import { cuesFor, type Cue } from '../recipes';
import { LOOP_STEPS, advance, newSched, type MusicState } from '../music';
import { createChain, playCue, playMusicNote } from '../synth';
import { VoiceLimiter } from '../mixer';

const SR = 44100;
const EVENTS: { [K in keyof ObstEvents]: ObstEvents[K] } = {
  'obst.jump': { player: 0, kind: 'ground' },
  'obst.land': { player: 0, impact: 960, on: 'ground' },
  'obst.ropeTaut': { rope: 0, link: 1, tension: 1.2 },
  'obst.ropeStrain': { rope: 0, link: 1, tension: 1.6 },
  'obst.grab': { player: 0, target: 'ring', targetId: 1 },
  'obst.release': { player: 0 },
  'obst.throw': { player: 0, target: 1, vx: 800, vy: -800 },
  'obst.handCatch': { player: 0, target: 1 },
  'obst.death': { player: 0, cause: 'crush' },
  'obst.bubble': { player: 0, reason: 'stray' },
  'obst.respawn': { player: 0, via: 'checkpoint' },
  'obst.checkpoint': { player: 0, index: 1 },
  'obst.star': { player: 0, index: 1, streak: 4 },
  'obst.plate': { id: 'p', pressed: true, weight: 4 },
  'obst.gate': { id: 'g', open: true },
  'obst.goalEnter': { player: 0, inside: 4, total: 4 },
  'obst.levelClear': { level: 'x', timeSec: 1, medal: 'gold', stars: 3, deaths: 0 },
  'obst.runEnd': { score: 1, levels: 1, reason: 'complete' },
};
const hot = (biome: Biome, over: Partial<MusicState> = {}): MusicState => ({
  biome,
  playing: true,
  progress: 1,
  danger: 1,
  stragglers: 1,
  moving: true,
  checkpointed: true,
  maxRopeTension: 1.5,
  lavaNear: true,
  ...over,
});

async function render(
  secs: number,
  build: (ctx: OfflineAudioContext, chain: ReturnType<typeof createChain>) => void,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * secs), SR);
  const chain = createChain(ctx);
  build(ctx, chain);
  return (await ctx.startRendering()).getChannelData(0);
}
function stats(d: Float32Array, startS = 0) {
  let peak = 0,
    sum = 0,
    last = -1,
    nan = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]!);
    if (!Number.isFinite(a)) {
      nan++;
      continue;
    }
    if (a > peak) peak = a;
    sum += a * a;
    if (a > 0.001) last = i;
  }
  return {
    peak: +peak.toFixed(4),
    rms: +Math.sqrt(sum / d.length).toFixed(4),
    tailS: last < 0 ? 0 : +Math.max(0, last / SR - startS).toFixed(3),
    nan,
  };
}
const cuesOf = (name: keyof ObstEvents, b: Biome): Cue[] => cuesFor(name, EVENTS[name] as never, b);

export async function main() {
  const out: Record<string, unknown> = {};
  // 1. every event, loudest case, biome beach (+ each land surface via biome)
  const single: Record<string, unknown> = {};
  for (const name of Object.keys(EVENTS) as (keyof ObstEvents)[]) {
    const d = await render(4, (ctx, chain) => {
      for (const c of cuesOf(name, 'beach')) playCue(ctx, chain, c, 0.1);
    });
    single[name] = stats(d, 0.1);
  }
  out.single = single;
  // 2. 8 simultaneous jumps (through the limiter), per biome
  const jumps: Record<string, unknown> = {};
  for (const b of BIOMES) {
    const lim = new VoiceLimiter();
    let played = 0;
    const d = await render(1, (ctx, chain) => {
      for (let p = 0; p < 9; p++)
        for (const c of cuesFor('obst.jump', { player: p, kind: 'ground' }, b))
          if (lim.allow(c, 0.1)) {
            playCue(ctx, chain, c, 0.1);
            played++;
          }
    });
    jumps[b] = { ...stats(d, 0.1), played };
  }
  out.jumps8 = jumps;
  // 3. music alone, calm and hot, per biome (6 s)
  const music: Record<string, unknown> = {};
  for (const b of BIOMES)
    for (const [label, st] of [
      [
        'calm',
        { ...hot(b), progress: 0, danger: 0, stragglers: 0, moving: false, checkpointed: false, maxRopeTension: 0, lavaNear: false },
      ],
      ['hot', hot(b)],
    ] as const) {
      const d = await render(6, (ctx, chain) => {
        for (const n of advance(newSched(0), 0, 5.5, st).notes) playMusicNote(ctx, chain, n);
      });
      music[`${b}:${label}`] = stats(d);
    }
  out.music = music;
  // 4. maximum mix: hot music + 8 jumps + 8 lands + deaths + checkpoint + levelClear + 3 rope strains + fanfare, over 2 s
  const worst: Record<string, unknown> = {};
  for (const b of BIOMES) {
    const lim = new VoiceLimiter();
    let played = 0,
      denied = 0;
    const d = await render(6, (ctx, chain) => {
      for (const n of advance(newSched(0), 0, 5.5, hot(b)).notes) playMusicNote(ctx, chain, n);
      const all: Cue[] = [];
      for (let p = 0; p < 8; p++) {
        all.push(
          ...cuesFor('obst.jump', { player: p, kind: 'ground' }, b),
          ...cuesFor('obst.land', { player: p, impact: 960, on: 'ground' }, b),
          ...cuesFor('obst.death', { player: p, cause: 'crush' }, b),
          ...cuesFor('obst.star', { player: p, index: 1, streak: p + 1 }, b),
          ...cuesFor('obst.ropeStrain', { rope: p, link: 0, tension: 1.6 }, b),
          ...cuesFor('obst.ropeTaut', { rope: p, link: 1, tension: 1.6 }, b),
        );
      }
      all.push(
        ...cuesOf('obst.checkpoint', b),
        ...cuesOf('obst.levelClear', b),
        ...cuesOf('obst.goalEnter', b),
        ...cuesOf('obst.runEnd', b),
      );
      for (const c of all) {
        if (lim.allow(c, 2)) {
          playCue(ctx, chain, c, 2);
          played++;
        } else denied++;
      }
    });
    worst[b] = { ...stats(d), played, denied };
  }
  out.worst = worst;
  // 5. unlimited worst case (limiter bypassed): everything above without the voice limit
  const raw: Record<string, unknown> = {};
  for (const b of ['beach', 'volcano'] as const) {
    const d = await render(6, (ctx, chain) => {
      for (const n of advance(newSched(0), 0, 5.5, hot(b)).notes) playMusicNote(ctx, chain, n);
      for (let k = 0; k < 4; k++)
        for (let p = 0; p < 8; p++)
          for (const c of [
            ...cuesFor('obst.jump', { player: p, kind: 'ground' }, b),
            ...cuesFor('obst.death', { player: p, cause: 'crush' }, b),
            ...cuesOf('obst.levelClear', b),
          ])
            playCue(ctx, chain, c, 2);
    });
    raw[b] = stats(d);
  }
  out.noLimiter = raw;
  out.loopSteps = LOOP_STEPS;
  return out;
}
const post = (body: string) => fetch('/result', { method: 'POST', body }).catch(() => {});
main().then(
  (r) => post(JSON.stringify(r)),
  (e) => post(`ERROR ${String(e?.stack ?? e)}`),
);
