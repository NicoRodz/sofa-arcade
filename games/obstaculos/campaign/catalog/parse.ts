// Reading an expedition back from disk or from the wire: anything that is not shaped like one is refused whole (null), never half-trusted.
// Used by the server on every read and write, so a corrupt file can never reach the rules.
import { NO_ASSISTS, SCHEMA_VERSION, type Assists, type Expedition, type LevelProgress, type Stars } from '../progress/progress';

export const EXPEDITION_ID = /^[a-z0-9][a-z0-9-]{2,39}$/; // also what keeps an id from reaching outside the data folder
export const NAME_MAX = 40;
const MAX_LEVELS = 256;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const LEVEL_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,23}$/;

function parseProgress(v: unknown): LevelProgress | null {
  if (!isObj(v)) return null;
  const st = v.stars;
  if (typeof v.done !== 'boolean' || typeof v.timeMedal !== 'boolean' || typeof v.skipped !== 'boolean') return null;
  if (!Array.isArray(st) || st.length !== 3 || !st.every((x) => typeof x === 'boolean')) return null;
  if (v.bestTimeMs !== null && !int(v.bestTimeMs, 0, 86_400_000)) return null;
  if (!int(v.collectiblesMask, 0, 0x7fffffff)) return null;
  return {
    done: v.done,
    stars: [st[0], st[1], st[2]] as Stars,
    bestTimeMs: v.bestTimeMs as number | null,
    timeMedal: v.timeMedal,
    collectiblesMask: v.collectiblesMask,
    skipped: v.skipped,
  };
}
function parseAssists(v: unknown): Assists | null {
  if (v === undefined) return { ...NO_ASSISTS };
  if (!isObj(v)) return null;
  const out: Assists = { ...NO_ASSISTS };
  for (const k of Object.keys(NO_ASSISTS) as (keyof Assists)[]) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== 'boolean') return null;
    out[k] = v[k] as boolean;
  }
  return out;
}

export function parseExpedition(raw: unknown): Expedition | null {
  if (!isObj(raw) || raw.schemaVersion !== SCHEMA_VERSION) return null;
  if (typeof raw.id !== 'string' || !EXPEDITION_ID.test(raw.id)) return null;
  if (typeof raw.name !== 'string' || raw.name.length < 1 || raw.name.length > NAME_MAX) return null;
  if (!int(raw.createdAt, 0, 2 ** 53) || !int(raw.updatedAt, 0, 2 ** 53)) return null;
  if (!isObj(raw.levels) || Object.keys(raw.levels).length > MAX_LEVELS) return null;
  const levels: Record<string, LevelProgress> = {};
  for (const [id, p] of Object.entries(raw.levels)) {
    const lp = LEVEL_ID.test(id) ? parseProgress(p) : null;
    if (!lp) return null;
    levels[id] = lp;
  }
  if (
    !Array.isArray(raw.unlocked) ||
    raw.unlocked.length > MAX_LEVELS ||
    !raw.unlocked.every((u) => typeof u === 'string' && u.length <= 32)
  )
    return null;
  const assists = parseAssists(raw.assists);
  if (!assists) return null;
  if (raw.lastLevelId !== null && !(typeof raw.lastLevelId === 'string' && LEVEL_ID.test(raw.lastLevelId))) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    levels,
    unlocked: [...new Set(raw.unlocked as string[])],
    assists,
    lastLevelId: raw.lastLevelId as string | null,
  };
}

export const cleanName = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '');
