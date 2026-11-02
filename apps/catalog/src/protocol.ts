// The wire protocol composed with this build's games: the parser and the default config the relay and the screens use.
import { createClientParser, type LobbyConfig } from '@pichi/core';
import { composeProtocol, defaultConfig } from '@pichi/core/contract';
import { arenaProtocol } from '@pichi/game-arena';
import { obstaculosProtocol } from '@pichi/game-obstaculos';
import { pizzasProtocol } from '@pichi/game-pizzas';
import { CATALOG, DEV_CATALOG } from './games';

export const PROTOCOL = composeProtocol([pizzasProtocol, arenaProtocol, obstaculosProtocol]);
export const parseClientMessage = createClientParser(PROTOCOL, CATALOG);
export const DEFAULT_CONFIG: LobbyConfig = defaultConfig(CATALOG, PROTOCOL);

// The relay's parser: every game of the build, the ones in development included (none today: Manchazo was published in F5, so this is the published one).
export const DEV_PROTOCOL = PROTOCOL;
export const parseDevClientMessage = createClientParser(DEV_PROTOCOL, DEV_CATALOG);
