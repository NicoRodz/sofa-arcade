// What a game tells the platform about the opaque slots of the wire protocol (design pichiclub-refactor §2.1). The cable is the same for every game
// (PROTOCOL_VERSION is global): a GameProtocol only says which values of `map`, `puestos` and `sig.kind` it accepts; the platform never imports a game.
import { DEFAULT_DIFFICULTY } from '../difficulty';
import type { LobbyConfig } from '../wire/config';
import type { GameCatalog } from './catalog';
import { DEFAULT_MODE } from './options';

export interface GameProtocol {
  readonly game: string;
  readonly defaultMap?: string;
  isMap?(v: string): boolean;
  isPuesto?(v: string): boolean;
  readonly signalKinds?: readonly string[];
  /** How many puesto ids the game has: the most a phone's "Cambiar" pool may hold. Absent: none. */
  readonly puestoCount?: number;
  /** Validates the `result` slot of a phase message (the verdict a phone shows). Returns the clean value, or null when malformed. Absent: the game sends none. */
  parseResult?(v: unknown): unknown;
}
export interface ProtocolExt {
  isMap(v: string): boolean; // union of the games = what the single parser accepted before
  isPuesto(v: string): boolean;
  isSignalKind(v: string): boolean;
  defaultMap(game: string): string | undefined;
  readonly puestoCount: number; // the biggest of the games
  parseResult(v: unknown): unknown; // the first game that accepts the value; null when none does
}

export function composeProtocol(games: readonly GameProtocol[]): ProtocolExt {
  const seen = new Set<string>();
  for (const g of games) {
    if (seen.has(g.game)) throw new Error(`duplicated game protocol: ${g.game}`);
    seen.add(g.game);
  }
  const list = [...games];
  return {
    isMap: (v) => list.some((g) => g.isMap?.(v) === true),
    isPuesto: (v) => list.some((g) => g.isPuesto?.(v) === true),
    isSignalKind: (v) => list.some((g) => g.signalKinds?.includes(v) === true),
    defaultMap: (game) => list.find((g) => g.game === game)?.defaultMap,
    puestoCount: Math.max(0, ...list.map((g) => g.puestoCount ?? 0)),
    parseResult: (v) => {
      for (const g of list) {
        const r = g.parseResult?.(v) ?? null;
        if (r !== null) return r;
      }
      return null;
    },
  };
}

/** The lobby config a room starts with: the catalog's first game, its default map, cooperative, no teams. */
export const defaultConfig = (catalog: GameCatalog, ext: ProtocolExt): LobbyConfig => ({
  game: catalog.defaultGame,
  difficulty: DEFAULT_DIFFICULTY,
  map: ext.defaultMap(catalog.defaultGame) ?? '',
  seed: 1,
  modeId: DEFAULT_MODE,
  teams: null,
  teamsLocked: false,
  modeOptions: {},
});
