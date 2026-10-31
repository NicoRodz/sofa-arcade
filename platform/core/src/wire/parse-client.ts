import { parseAppearanceMsg } from '../avatar';
import type { GameCatalog } from '../contract/catalog';
import type { ProtocolExt } from '../contract/protocol';
import { isNavKey } from '../lobby/captain';
import { parseMenuAct, parseMenuErr, parseMenuSnapshot } from '../lobby/menu';
import { intIn, num } from '../lobby/parse';
import { MAX_TEAMS } from '../lobby/teams';
import { isBuzzKind } from './constants';
import type { ClientMsg } from './client-msg';
import { parseConfig, parseHint, parseInput, parseJoin, parsePhase, parsePing, parsePuesto, parseSchool } from './parse-fields';

type Msg = Record<string, any>;
type Parser = (m: Msg) => ClientMsg | null;

/**
 * The one parser of what a socket sends: a table of parsers by `t`. The game-owned parts (map, puesto ids, signal kinds, game ids and modes) come from `ext`
 * and `catalog`, so this knows no game. Anything malformed, or with an unknown `t`, is null.
 */
export function createClientParser(ext: ProtocolExt, catalog: GameCatalog): (raw: string) => ClientMsg | null {
  const table = new Map<string, Parser>([
    ['join', parseJoin],
    ['input', (m) => parseInput(m, ext)],
    ['ping', parsePing],
    ['phase', (m) => parsePhase(m, ext, catalog)],
    ['puesto', (m) => parsePuesto(m, ext)],
    ['setTeam', (m) => (intIn(m.teamId, 0, MAX_TEAMS - 1) ? { t: 'setTeam', teamId: m.teamId } : null)],
    ['buzz', (m) => (num(m.playerId) && isBuzzKind(m.kind) ? { t: 'buzz', playerId: m.playerId, kind: m.kind } : null)],
    ['hint', parseHint],
    [
      'appearance',
      (m) => {
        const v = parseAppearanceMsg(m);
        return v ? { t: 'appearance', ...v } : null;
      },
    ],
    ['assist', (m) => (typeof m.on === 'boolean' ? { t: 'assist', on: m.on } : null)],
    ['schoolDone', (m) => ({ t: 'schoolDone', ...(m.skip === true ? { skip: true as const } : {}) })],
    ['school', parseSchool],
    [
      'menu',
      (m) => {
        const v = parseMenuSnapshot(m);
        return v ? { t: 'menu', ...v } : null;
      },
    ],
    [
      'menuErr',
      (m) => {
        const v = parseMenuErr(m);
        return v ? { t: 'menuErr', ...v } : null;
      },
    ],
    [
      'menuAct',
      (m) => {
        const v = parseMenuAct(m);
        return v ? { t: 'menuAct', ...v } : null;
      },
    ],
    ['nav', (m) => (isNavKey(m.key) ? { t: 'nav', key: m.key } : null)], // anything else in the payload (a fake `from`) is dropped here
    ['config', (m) => parseConfig(m, ext, catalog)],
  ]);
  return (raw) => {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!m || typeof m !== 'object') return null;
    return table.get(m.t)?.(m) ?? null;
  };
}
