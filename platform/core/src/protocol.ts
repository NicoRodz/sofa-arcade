// The wire protocol of Pichiclub (v6), split by concern under ./wire. This is the barrel the rest of the repo imports. The parser, the default config and
// the game catalog are not here: they depend on the games, so apps/catalog composes them (see contract/protocol.ts and contract/catalog.ts).
export * from './wire/constants';
export * from './wire/input';
export * from './wire/phase';
export * from './wire/config';
export * from './wire/client-msg';
export * from './wire/server-msg';
export * from './wire/lobby-flow';
export { createClientParser } from './wire/parse-client';
export { ROUND_MS } from './difficulty';
export { MAX_TEAMS, type TeamInfo } from './lobby/teams';
export { MAX_PLAYERS, intIn, num, parseModeOptions, parseTeams, type ModeOptions } from './lobby/parse';
export * from './lobby/menu';
export {
  KEYBOARD_QUIET_MS,
  NAV_KEYS,
  NAV_TO_KEY,
  acceptNav,
  captainOf,
  isNavKey,
  navToKey,
  remoteBlocked,
  remoteVisible,
  type NavKey,
} from './lobby/captain';
