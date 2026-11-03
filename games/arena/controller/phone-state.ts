// F9: what the phone wears besides the notices. All of it hangs on data attributes and variables of <body> (the styles are phone.css): the team (background), the status the hints say
// (dizzy / stained, for as long as they keep saying it) and the card in hand (the colour of button B).
import { HINT_STATUSES, type HintStatus } from '@pichi/core';

export const STATUS_TEXT: Record<HintStatus, string> = { dizzy: '¡MAREADO!', stained: '¡MANCHADO!' };
/** A hint is resent every second while its state holds (HINT_REFRESH_MS on the TV); a phone that hears nothing for this long stops wearing the status (the TV closed, the link dropped). */
export const STATUS_STALE_MS = 2500;

// The card colours are the TV's (screen/art/glyphs CARD_HEX; a test keeps the two tables equal): the phone cannot import the TV's art (it draws with Phaser).
// biome-ignore format: one card per entry
export const CARD_HEX: Record<string, string> = { turpentine: '#7FE3FF', roller: '#FFD166', fan: '#A6F07A', footprints: '#FF8FD8', glue: '#C8A2FF', tape: '#E6D5A8', ink: '#F4F4FA', sponge: '#7DE0B0', swap: '#FF7A7A', dizzy: '#9AA0FF' };
const shade = (hex: string, k: number) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;

export function createPhoneState(body: HTMLElement) {
  let stale: ReturnType<typeof setTimeout> | undefined;
  const clearStatus = () => {
    clearTimeout(stale);
    delete body.dataset.arenaSt;
  };
  return {
    /** The team of this phone: 0 wears dots, 1 stripes (the colour is `--tc`, the platform's). */
    team(id: number) {
      body.dataset.arenaTeam = String(id);
    },
    status(st: HintStatus | undefined) {
      if (!st || !HINT_STATUSES.includes(st)) return clearStatus();
      body.dataset.arenaSt = st;
      body.style.setProperty('--arenast', JSON.stringify(STATUS_TEXT[st]));
      clearTimeout(stale);
      stale = setTimeout(clearStatus, STATUS_STALE_MS);
    },
    card(card: string | undefined) {
      const hex = card ? CARD_HEX[card] : undefined;
      if (!card || !hex) {
        delete body.dataset.arenaCard;
        body.style.removeProperty('--card');
        body.style.removeProperty('--card2');
        return;
      }
      body.dataset.arenaCard = card;
      body.style.setProperty('--card', hex);
      body.style.setProperty('--card2', shade(hex, 0.72));
    },
    clear() {
      clearStatus();
      this.card(undefined);
    },
  };
}
