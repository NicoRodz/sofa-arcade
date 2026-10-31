// The lookups the tests and the pages used when the games lived in core (same names), bound to this build's games, or to the list given.
import { configMsgOf, type ConfigMsg, type LobbyConfig } from '@pichi/core';
import { gameInfo as infoOf, type GameInfo, type GameManifest } from '@pichi/core/contract';
import { CATALOG, GAMES, type GameId } from './games';

export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);
export const DEFAULT_GAME: GameId = GAMES[0].id;
export const isGameId = (v: unknown): v is GameId => CATALOG.isGameId(v);
export const gameName = (id: string): string => CATALOG.name(id);
export const gameInfo = (id: string, games: readonly GameManifest[] = GAMES, modeId?: string): GameInfo => infoOf(id, games, modeId);
export const configMsg = (cfg: LobbyConfig, games: readonly GameManifest[] = GAMES): ConfigMsg =>
  configMsgOf(cfg, infoOf(cfg.game, games, cfg.modeId));
// Pure helpers of the contract that the tests import together with the lists above.
export { LABEL_MAX, choiceVoteSpec, gameProblems, modeOf } from '@pichi/core/contract';
