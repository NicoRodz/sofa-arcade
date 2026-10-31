import type { Slots } from '../contract/slots';
import type { RawAppearance } from '../avatar';
import type { MenuActBody, MenuErrBody, MenuSnapshot } from '../lobby/menu';
import type { NavKey } from '../lobby/captain';
import type { BuzzKind } from './constants';
import type { ConfigFromScreen, SchoolMsg } from './config';
import type { InputState } from './input';
import type { HintLabels, PhaseInfo } from './phase';

export type ClientMsg<S extends Slots = Slots> =
  | { t: 'join'; name: string; token: string; caps?: string[]; ap?: RawAppearance } // ap: the look, raw (the relay sanitizes it); caps: what this phone can draw (MENU_CAP); absent on an older phone
  | ({ t: 'input' } & InputState<S>)
  | { t: 'ping'; id: number; t0: number; rtt?: number; off?: number }
  | ({ t: 'phase' } & PhaseInfo<S>) // screen only
  | ({ t: 'config' } & ConfigFromScreen<S>) // screen only
  | { t: 'puesto'; puestos: S['puesto'][] } // phone: "Cambiar" picked another puesto
  | { t: 'setTeam'; teamId: number } // phone: "Cambiar de equipo" (the screen decides: it is the host and owns the lobby)
  | { t: 'buzz'; playerId: number; kind: BuzzKind } // screen only: vibrate that phone
  | ({ t: 'hint'; playerId: number } & HintLabels) // screen only: what A and B do for that chef right now (null: the game's own label), their icons and whether they are greyed; no third button
  | { t: 'appearance'; ap: RawAppearance; done: boolean } // phone: the look in the creator (done: it pressed "Listo"); lobby, menu and results only, 5/s
  | { t: 'assist'; on: boolean } // phone: switch Ayudante on or off for this player (lobby only; the relay keeps it with the player's slot)
  | ({ t: 'school'; playerId: number } & SchoolMsg) // screen only: the step and instruction of that chef in the Cocina escuela
  | { t: 'schoolDone'; skip?: true } // phone: this player already did the school (skip: just pressed "Saltar" during it); the relay keeps it with the slot
  | { t: 'nav'; key: NavKey } // phone: a D-pad button (only the Captain's is forwarded; the relay stamps who sent it)
  | ({ t: 'menu' } & MenuSnapshot) // screen only: the lobby as a form (the relay hands it to the Captain alone)
  | ({ t: 'menuErr' } & MenuErrBody) // screen only: the last act was refused (Captain only)
  | ({ t: 'menuAct' } & MenuActBody); // phone: the Captain's touch (only the Captain's is forwarded; the relay stamps who sent it)
