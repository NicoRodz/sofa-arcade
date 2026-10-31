import type { Slots } from '../contract/slots';
import type { Appearance } from '../avatar';
import type { MenuActBody, MenuErrBody, MenuSnapshot } from '../lobby/menu';
import type { NavKey } from '../lobby/captain';
import type { BuzzKind } from './constants';
import type { ConfigMsg, PublicPlayer, SchoolMsg } from './config';
import type { InputState } from './input';
import type { HintLabels, PhaseInfo } from './phase';

export type ServerMsg<S extends Slots = Slots> =
  | { t: 'joined'; player: PublicPlayer; room: string; v: number }
  | { t: 'error'; reason: string }
  | { t: 'pong'; id: number; t0: number; ts: number }
  | { t: 'state'; players: PublicPlayer[] }
  | { t: 'player_joined'; player: PublicPlayer }
  | { t: 'player_left'; playerId: number } // disconnected, slot still held
  | { t: 'player_removed'; playerId: number } // grace expired, slot freed
  | ({ t: 'phase' } & PhaseInfo<S>)
  | ConfigMsg<S>
  | ({ t: 'input'; playerId: number } & InputState<S>)
  | { t: 'rtt'; playerId: number; rtt: number; off: number }
  | { t: 'puesto'; playerId: number; puestos: S['puesto'][] }
  | { t: 'setTeam'; playerId: number; teamId: number } // to the screens: this phone asks to change team
  | { t: 'you'; teamId: number; color: string; icon: string; sideLabel?: string } // to one phone: its team (when it has one)
  | { t: 'buzz'; kind: BuzzKind }
  | ({ t: 'hint' } & HintLabels) // the label, icon and greyed state of A and B right now (null: back to the game's label)
  | { t: 'appearance'; playerId: number; ap: Appearance; customizing: boolean } // to everyone: this player's sanitized look changed (the relay stamps playerId)
  | { t: 'assist'; playerId: number; on: boolean } // to the screens, and to that phone itself (it remembers across a reconnect): this player's Ayudante is now on / off
  | ({ t: 'school' } & SchoolMsg) // to one phone: its step in the Cocina escuela
  | { t: 'schoolDone'; playerId: number; skip?: true } // to the screens: this phone knows the school (skip: it pressed "Saltar" now, the chef is done)
  | { t: 'captain'; playerId: number | null } // to everyone: who holds the crown now (null: nobody is connected)
  | ({ t: 'menu' } & MenuSnapshot) // to the Captain's phone only, when it announced MENU_CAP
  | ({ t: 'menuErr' } & MenuErrBody) // to the Captain's phone only
  | ({ t: 'menuAct'; from: number } & MenuActBody) // to the screens: the Captain touched the menu. `from` is stamped by the relay, like nav's
  | { t: 'nav'; from: number; key: NavKey }; // to the screens: the Captain's phone pressed this. `from` is set by the relay from the socket, never taken from the payload
