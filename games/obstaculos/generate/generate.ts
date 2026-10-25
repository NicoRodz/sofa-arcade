// Seeded level generator (plan §12): start -> [tramo, module] x k -> goal, validated with the same physics the game runs.
// Up to MAX_ATTEMPTS tries with mulberry32(seed ^ attempt * 0x9E3779B9); among the valid ones the closest to the centre of the
// difficulty band wins. With no valid attempt a hand-made level that fits is used and the case is logged in FALLBACK_LOG.
import { DIFFICULTY_PARAMS } from '../constants';
import { LEVELS } from '../levels';
import { difficultyOf } from '../metric/metric';
import { MODULES } from '../modules/defs';
import { tramo, flat, FRACTIONS, type TramoKind } from '../modules/tramos';
import type { LevelModule } from '../modules/types';
import { mulberry32, pick, randInt, type Rng } from '@pichi/core/rng';
import { BIOMES, type Biome, type GameMode, type LevelDef, type Tether } from '../types';
import { modesOf, validateState } from '../validator/validate';
import type { Difficulty } from '@pichi/core/difficulty';
import { LetterPool, flatCap, rename, toLevel, type Piece } from './assemble';

export const MAX_ATTEMPTS = 40;
const WANT_VALID = 3; // valid candidates compared before choosing (keeps the run time bounded)
const ATTEMPT_SALT = 0x9e3779b9;

export interface GenerateOpts {
  seed: number;
  n: number;
  tether: Tether;
  difficulty: Difficulty;
}
export interface GenerateReport {
  seed: number;
  n: number;
  tether: Tether;
  difficulty: Difficulty;
  attempts: number; // tries made (valid or not)
  rejected: number; // tries the validator refused
  d: number; // difficulty D of the chosen level
  band: readonly [number, number];
  inBand: boolean;
  fallback: string | null; // id of the hand-made level used when nothing valid came out
  modules: string[];
  cols: number;
}
export interface GenerateResult {
  level: LevelDef;
  report: GenerateReport;
}
export const FALLBACK_LOG: string[] = [];

const LENGTHS: Record<Difficulty, readonly number[]> = { easy: [90, 90, 120], normal: [90, 120, 120, 160], hard: [120, 160, 160] };
const COOP_SHARE: Record<Difficulty, number> = { easy: 0.2, normal: 0.4, hard: 0.6 };
const FRACS: Record<Difficulty, readonly number[]> = {
  easy: [FRACTIONS[0]],
  normal: [FRACTIONS[0], FRACTIONS[1]],
  hard: [FRACTIONS[1], FRACTIONS[2]],
};

const eligible = (m: LevelModule, n: number, tether: Tether): boolean =>
  m.minPlayers <= n && (m.maxPlayers ?? 8) >= n && (m.tether === 'any' || m.tether === tether);

const stars = (d: number): 1 | 2 | 3 | 4 | 5 => (d < 25 ? 1 : d < 35 ? 2 : d < 50 ? 3 : d < 65 ? 4 : 5);

// One attempt: the pieces of a level, deterministic in rng.
function compose(rng: Rng, o: GenerateOpts): { pieces: Piece[]; modules: string[] } {
  const target = pick(rng, LENGTHS[o.difficulty]);
  const pool = new LetterPool();
  const pieces: Piece[] = [flatCap(8, { ch: 'S', x: 3 })];
  const modules: string[] = [];
  let width = 2 + 8 + 8; // walls + caps
  let sinceP = 0,
    last = '';
  const add = (p: Piece) => {
    pieces.push(p);
    width += p.w;
    sinceP += p.w;
  };
  while (width < target - 12) {
    const k = randInt(rng, 1, 2);
    for (let i = 0; i < k; i++)
      add(
        tramo(
          pick(rng, ['gap', 'hill', 'strip', 'hops', 'flat', 'gap', 'hill'] as TramoKind[]),
          pick(rng, FRACS[o.difficulty]),
          o.tether,
          rng,
        ),
      );
    const wantCoop = rng() < COOP_SHARE[o.difficulty];
    const list = MODULES.filter((m) => eligible(m, o.n, o.tether) && m.id !== last && m.coop === wantCoop);
    const mod = list.length ? pick(rng, list) : null;
    if (mod) {
      const renamed = rename({ w: mod.w, rows: mod.rows, params: mod.params }, pool);
      if (renamed) {
        if (mod.coop || sinceP > 35) {
          add(flat(6, true));
          sinceP = 0;
        } // checkpoint before every cooperative module, and about every 35 columns
        add(renamed);
        modules.push(mod.id);
        last = mod.id;
      }
    }
    if (sinceP > 35) {
      add(flat(6, true));
      sinceP = 0;
    }
  }
  pieces.push(flatCap(8, { ch: 'G', x: 4 }));
  return { pieces, modules };
}

// 3 to 6 stars on open air three tiles above flat floor (a jump from the floor takes them).
function addStars(rows: string[], rng: Rng): string[] {
  const h = rows.length;
  const w = rows[0]!.length;
  const spots: number[] = [];
  for (let x = 12; x < w - 12; x++)
    if (rows[14]![x] === '.' && rows[15]![x] === '#' && rows[13]![x] === '.' && rows[12]![x] === '.' && rows[11]![x] === '.') spots.push(x);
  const out = rows.map((r) => r.split(''));
  const count = Math.min(spots.length, randInt(rng, 3, 6));
  for (let i = 0; i < count; i++) {
    const j = randInt(rng, 0, spots.length - 1);
    out[11]![spots[j]!] = '*';
    spots.splice(j, 1);
  }
  void h;
  return out.map((r) => r.join(''));
}

const modesFor = (t: Tether): GameMode[] => modesOf({ tether: t } as LevelDef);

export function generateLevel(o: GenerateOpts): GenerateResult {
  const band = DIFFICULTY_PARAMS[o.difficulty].band;
  const center = (band[0] + band[1]) / 2;
  const candidates: { level: LevelDef; d: number; modules: string[] }[] = [];
  let attempts = 0,
    rejected = 0;
  for (let a = 0; a < MAX_ATTEMPTS && candidates.length < WANT_VALID; a++) {
    attempts++;
    const rng = mulberry32((o.seed ^ Math.imul(a, ATTEMPT_SALT)) >>> 0);
    const { pieces, modules } = compose(rng, o);
    const draft = toLevel(pieces, {
      id: `gen-${o.seed}`,
      name: `Expedición ${o.seed}`,
      biome: pick(rng, BIOMES as readonly Biome[]),
      players: { min: o.n, max: o.n },
      tether: o.tether,
      stars: 3,
      parSec: 90,
    });
    const level: LevelDef = { ...draft, rows: addStars(draft.rows, rng) };
    let ok = true,
      dSum = 0,
      secs = 0;
    for (const mode of modesFor(o.tether)) {
      const r = validateState(level, { n: o.n, mode, diff: o.difficulty });
      if (!r.ok) {
        ok = false;
        break;
      }
      dSum += difficultyOf(r, level).D;
      secs = Math.max(secs, r.pathSeconds);
    }
    if (!ok) {
      rejected++;
      continue;
    }
    const d = dSum / modesFor(o.tether).length;
    candidates.push({ level: { ...level, stars: stars(d), parSec: Math.max(30, Math.round((secs * 2.2) / 5) * 5) }, d, modules });
  }
  if (candidates.length) {
    const best = candidates.reduce((p, c) => (Math.abs(c.d - center) < Math.abs(p.d - center) ? c : p));
    return {
      level: best.level,
      report: {
        seed: o.seed,
        n: o.n,
        tether: o.tether,
        difficulty: o.difficulty,
        attempts,
        rejected,
        d: best.d,
        band,
        inBand: best.d >= band[0] && best.d <= band[1],
        fallback: null,
        modules: best.modules,
        cols: best.level.rows[0]!.length,
      },
    };
  }
  const want = o.difficulty === 'easy' ? 1.5 : o.difficulty === 'normal' ? 3 : 4.5;
  const fits = LEVELS.filter((l) => l.players.min <= o.n && l.players.max >= o.n && (l.tether === 'any' || l.tether === o.tether));
  const fb = [...(fits.length ? fits : LEVELS)].sort((x, y) => Math.abs(x.stars - want) - Math.abs(y.stars - want))[0]!;
  FALLBACK_LOG.push(`seed ${o.seed} n=${o.n} ${o.tether} ${o.difficulty}: ${attempts} attempts, none valid; used ${fb.id}`);
  return {
    level: fb,
    report: {
      seed: o.seed,
      n: o.n,
      tether: o.tether,
      difficulty: o.difficulty,
      attempts,
      rejected,
      d: 0,
      band,
      inBand: false,
      fallback: fb.id,
      modules: [],
      cols: fb.rows[0]!.length,
    },
  };
}
