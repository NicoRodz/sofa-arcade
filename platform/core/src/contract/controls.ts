// What a phone shows for a game: the labels of the stick and the two buttons, and the "how to play" steps. EXPERIMENTAL (F4a).
// Moved from games.ts without changes; games.ts re-exports every name, so the imports of the server, the controller and the tests do not move.
import type { IconId } from '../icons';

export interface ControlLabel {
  label: string;
  icon: IconId;
  hold?: boolean;
} // hold: the button is meant to be kept pressed
export interface GameControls {
  stick: ControlLabel;
  btn1: ControlLabel;
  btn2: ControlLabel;
} // btn1 = bit 0 / presses[0], btn2 = bit 1 / presses[1]
export interface HowToStep {
  icon: IconId;
  text: string;
}
export interface HowTo {
  steps: readonly HowToStep[];
  note?: string;
}
export interface GameInfo {
  controls: GameControls;
  howTo: HowTo;
}
