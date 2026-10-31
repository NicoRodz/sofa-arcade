// The notice on the big screen while the Captain's phone holds the lobby's form: "Capitán: elige desde tu teléfono". It shows from the first snapshot of a lobby
// until the Captain touches something (then the ring and the changes on the screen are the cue) or the lobby closes. DOM only; a node test finds no document.
import './captain-banner.css';

const TEXT = 'Capitán: elige desde tu teléfono';
let el: HTMLElement | null = null;
let dismissed = false; // the Captain already acted in this lobby

const node = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'capbanner';
    el.setAttribute('role', 'status');
    el.textContent = TEXT;
    (document.getElementById('stage') ?? document.body).appendChild(el); // inside the stage: it scales with the title it must not touch
  }
  return el;
};
const show = (on: boolean) => node()?.classList.toggle('on', on);

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
