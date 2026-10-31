// The game contract (plan reestructura-repo, section 3). EXPERIMENTAL: minimal on purpose; Arena (F6) is the third implementer that proves it.
// Pure types (this package has no DOM lib): the screen-side half of the contract, `ScreenGame`, lives in @pichi/screen-kit/shell/game because it
// talks to Phaser and the DOM. GameSim, PlayerInput, ControlEvent and the core ControllerGame stub were retired (design pichiclub-refactor §2.2):
// no game implemented them and the relay never steps a sim; a real ControllerGame arrives with F5d.
//
// GameManifest IS the old registry entry (GameDef): same field names (name, minPlayers, maxPlayers, controls, howTo, modes), so the relay,
// the phones and the tests did not change. `icon`, `color`, `options`, `tickHz` of the sketch are not there: nothing reads them yet.
import type { ControlLabel, GameControls, GameInfo } from './controls';
import type { ModeId, ModeSpec } from './options';

export interface GameManifest extends GameInfo {
  id: string; // stable: it travels in the protocol and keys the stats
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number; // the range is inclusive; the menu card shows it and disables itself outside it
  modes?: readonly ModeSpec[];
  defaultMode?: ModeId;
}

/** What the phone paints: the stick and the two buttons (today the same shape as the manifest's `controls`). */
export type ControlLayout = GameControls;
export type { ControlLabel };
