// The wire protocol composed with this build's games: the parser and the default config the relay and the screens use.
import { createClientParser, type LobbyConfig } from '@pichi/core';
import { composeProtocol, defaultConfig } from '@pichi/core/contract';
import { arenaProtocol } from '@pichi/game-arena';
import { obstaculosProtocol } from '@pichi/game-obstaculos';
import { pizzasProtocol } from '@pichi/game-pizzas';
import { CATALOG, DEV_CATALOG } from './games';

export const PROTOCOL = composeProtocol([pizzasProtocol, obstaculosProtocol]);
export const parseClientMessage = createClientParser(PROTOCOL, CATALOG);
export const DEFAULT_CONFIG: LobbyConfig = defaultConfig(CATALOG, PROTOCOL);

// The same with the games in development: the relay parses with these (it accepts a config that picks Arena; the screen only sends one under `?soon=1`).
export const DEV_PROTOCOL = composeProtocol([pizzasProtocol, obstaculosProtocol, arenaProtocol]);
export const parseDevClientMessage = createClientParser(DEV_PROTOCOL, DEV_CATALOG);
