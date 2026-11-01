// The notice on the big screen while the Captain's phone holds the lobby's form: "Capitán: elige desde tu teléfono". It shows from the first snapshot of a lobby
// until the Captain touches something (then the ring and the changes on the screen are the cue) or the lobby closes.
import './captain-banner.css';
import { renderCaptainNotice } from '../screens/lobby/view';

let dismissed = false; // the Captain already acted in this lobby

// the notice is a template in #capbannerhost (inside the stage: it scales with the title it must not touch); no document in a node test
const show = (on: boolean) => {
  if (typeof document !== 'undefined' && document.getElementById('capbannerhost')) renderCaptainNotice(on);
};

/** A snapshot went out (`up`) or the form is gone (the lobby closed, no Captain). */
export function bannerForm(up: boolean) {
  if (!up) dismissed = false;
  show(up && !dismissed);
}
/** The Captain touched the form. */
export function bannerActed() {
  dismissed = true;
  show(false);
}
