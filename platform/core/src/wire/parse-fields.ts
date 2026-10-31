// The field-level validators of the client parser, one per message that has real content. They take the game-owned parts (map, puesto ids, signal kinds, game
// ids and modes) from the injected ProtocolExt and GameCatalog, so this file knows no game. Moved out of protocol.ts keeping every check and its order.
import { parseRawAppearance } from '../avatar';
import type { GameCatalog } from '../contract/catalog';
import { DEFAULT_MODE, isModeId } from '../contract/options';
import type { ProtocolExt } from '../contract/protocol';
import { isDifficulty } from '../difficulty';
import { LABEL_MAX } from '../contract/catalog';
import { isIconId, type IconId } from '../icons';
import { parseCaps } from '../lobby/menu';
import { intIn, num, parseModeOptions, parsePhoneResult, parseTeams, MAX_PLAYERS, text } from '../lobby/parse';
import { BUTTON_COUNT, PHASES, PRESS_MOD, isSeed } from './constants';
import type { ClientMsg } from './client-msg';
import type { PuestoAssign, PuestoMsg, Score } from './phase';
import { hintExtras } from './phase';

type Of<T extends ClientMsg['t']> = Extract<ClientMsg, { t: T }>;
type Msg = Record<string, any>;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const wrap = (p: number) => ((p % PRESS_MOD) + PRESS_MOD) % PRESS_MOD;

export function parseJoin(m: Msg): Of<'join'> | null {
  if (typeof m.name !== 'string' || typeof m.token !== 'string' || !m.token) return null;
  return {
    t: 'join',
    name: m.name.trim().slice(0, 16) || 'Player',
    token: m.token.slice(0, 64),
    ...(m.caps !== undefined ? { caps: parseCaps(m.caps) } : {}),
    ...(parseRawAppearance(m.ap) ? { ap: parseRawAppearance(m.ap) } : {}),
  };
}

export function parseInput(m: Msg, ext: ProtocolExt): Of<'input'> | null {
  if (!num(m.seq) || !num(m.x) || !num(m.y) || !num(m.btn) || !num(m.ts)) return null;
  if (!Array.isArray(m.presses) || !m.presses.every(num)) return null;
  const sig =
    m.sig && typeof m.sig === 'object' && ext.isSignalKind(m.sig.kind) && Number.isInteger(m.sig.seq)
      ? { kind: m.sig.kind as string, seq: wrap(m.sig.seq) }
      : undefined; // a malformed signal is dropped, never the whole input
  return {
    t: 'input',
    seq: m.seq,
    x: clamp1(m.x),
    y: clamp1(m.y),
    btn: m.btn | 0,
    presses: m.presses.slice(0, BUTTON_COUNT).map((p: number) => wrap(p)),
    ts: m.ts,
    ...(sig ? { sig } : {}),
    ...(m.go === true ? { go: true } : {}),
  };
}

export function parsePing(m: Msg): Of<'ping'> | null {
  if (!num(m.id) || !num(m.t0)) return null;
  return { t: 'ping', id: m.id, t0: m.t0, rtt: num(m.rtt) ? m.rtt : undefined, off: num(m.off) ? m.off : undefined };
}

export const parsePuestoIds = (v: unknown, ext: ProtocolExt, max = 4): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => ext.isPuesto(x)) ? [...v] : null;
export function parsePuestoMsg(v: any, ext: ProtocolExt): PuestoMsg | null {
  if (
    !v ||
    typeof v !== 'object' ||
    typeof v.cheese !== 'boolean' ||
    typeof v.sink !== 'boolean' ||
    !Array.isArray(v.assign) ||
    v.assign.length > MAX_PLAYERS
  )
    return null;
  const assign: PuestoAssign[] = [];
  for (const a of v.assign) {
    const puestos = parsePuestoIds(a?.puestos, ext),
      pool = parsePuestoIds(a?.pool, ext, ext.puestoCount);
    if (!a || !num(a.id) || !puestos || !pool) return null;
    assign.push({ id: a.id, puestos, pool });
  }
  return { cheese: v.cheese, sink: v.sink, assign };
}
export function parsePuesto(m: Msg, ext: ProtocolExt): Of<'puesto'> | null {
  const ids = parsePuestoIds(m.puestos, ext);
  return ids?.length ? { t: 'puesto', puestos: ids } : null;
}

export function parsePhase(m: Msg, ext: ProtocolExt, catalog: GameCatalog): Of<'phase'> | null {
  if (!PHASES.includes(m.phase)) return null;
  const out: Of<'phase'> = { t: 'phase', phase: m.phase };
  if (m.match !== undefined) {
    const mt = m.match,
      teams = mt && typeof mt === 'object' ? parseTeams(mt.teams) : undefined,
      opts = mt && typeof mt === 'object' ? parseModeOptions(mt.modeOptions) : undefined;
    if (
      !mt ||
      typeof mt !== 'object' ||
      !catalog.isGameId(mt.gameId) ||
      !isModeId(mt.modeId) ||
      !text(mt.mapId, 16) ||
      !isDifficulty(mt.difficulty) ||
      teams === undefined ||
      !opts
    )
      return null;
    out.match = { gameId: mt.gameId, modeId: mt.modeId, mapId: mt.mapId, difficulty: mt.difficulty, teams, modeOptions: opts };
  }
  if (m.scores !== undefined) {
    if (!Array.isArray(m.scores) || !m.scores.every((x: any) => x && num(x.id) && num(x.score))) return null;
    out.scores = m.scores.map((x: Score) => ({ id: x.id, score: x.score }));
  }
  if (m.result !== undefined) {
    const r = parsePhoneResult(m.result);
    if (!r) return null;
    out.result = r;
  }
  if (m.puestos !== undefined) {
    const p = parsePuestoMsg(m.puestos, ext);
    if (!p) return null;
    out.puestos = p;
  }
  return out;
}

export function parseHint(m: Msg): Of<'hint'> | null {
  const label = (v: unknown): string | null | undefined =>
    v === null || v === undefined ? null : typeof v === 'string' && v.trim() && v.length <= LABEL_MAX ? v : undefined;
  const a = label(m.a),
    b = label(m.b);
  const icon = (v: unknown): IconId | null | undefined => (v === undefined || v === null ? null : isIconId(v) ? v : undefined);
  const aIcon = icon(m.aIcon),
    bIcon = icon(m.bIcon);
  if (!num(m.playerId) || a === undefined || b === undefined || aIcon === undefined || bIcon === undefined) return null;
  return {
    t: 'hint',
    playerId: m.playerId,
    a,
    b,
    ...hintExtras({
      a,
      b,
      ...(aIcon ? { aIcon } : {}),
      ...(bIcon ? { bIcon } : {}),
      ...(m.aOff === true ? { aOff: true } : {}),
      ...(m.bOff === true ? { bOff: true } : {}),
    }),
  };
}

export function parseSchool(m: Msg): Of<'school'> | null {
  if (
    !num(m.playerId) ||
    !intIn(m.step, 0, 8) ||
    !intIn(m.total, 1, 8) ||
    m.step > m.total ||
    !text(m.text, 48) ||
    !(m.btn === undefined || m.btn === 'a' || m.btn === 'b')
  )
    return null;
  return {
    t: 'school',
    playerId: m.playerId,
    step: m.step,
    total: m.total,
    text: m.text,
    ...(m.btn ? { btn: m.btn } : {}),
    ...(m.done === true ? { done: true as const } : {}),
  };
}

export function parseConfig(m: Msg, ext: ProtocolExt, catalog: GameCatalog): Of<'config'> | null {
  // versus lobbies hold a versus map choice (V1.., vs-auto, vs-random): the games own which maps exist, ext.isMap is their union
  if (!catalog.isGameId(m.game) || !isDifficulty(m.difficulty) || !ext.isMap(m.map) || !isSeed(m.seed)) return null;
  const modeId = m.modeId === undefined ? DEFAULT_MODE : m.modeId; // a v1 screen sends none: cooperative
  const teams = parseTeams(m.teams),
    modeOptions = parseModeOptions(m.modeOptions);
  if (
    !isModeId(modeId) ||
    !catalog.modes(m.game).some((x) => x.id === modeId) ||
    teams === undefined ||
    !modeOptions ||
    (m.teamsLocked !== undefined && typeof m.teamsLocked !== 'boolean')
  )
    return null;
  return {
    t: 'config',
    game: m.game,
    difficulty: m.difficulty,
    map: m.map,
    seed: m.seed,
    modeId,
    teams,
    teamsLocked: m.teamsLocked === true,
    modeOptions,
  };
}
