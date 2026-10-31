// The wire protocol composed with this build's games: the parser and the default config the relay and the screens use.
import { createClientParser, type LobbyConfig } from '@pichi/core';
import { composeProtocol, defaultConfig } from '@pichi/core/contract';
import { obstaculosProtocol } from '@pichi/game-obstaculos/protocol';
import { pizzasProtocol } from '@pichi/game-pizzas/protocol';
import { CATALOG } from './games';

export const PROTOCOL = composeProtocol([pizzasProtocol, obstaculosProtocol]);
export const parseClientMessage = createClientParser(PROTOCOL, CATALOG);
export const DEFAULT_CONFIG: LobbyConfig = defaultConfig(CATALOG, PROTOCOL);
