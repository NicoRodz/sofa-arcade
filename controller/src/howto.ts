// When the phone shows the "how to play" card: when joining and when the screen enters a game it has not shown yet.
// Never in the start menu (no game picked yet) and never during a round (a phone that reconnects mid-game must not get a card over the pad).
import type { Phase } from '@party/shared';

export const shouldShowHowTo = (seenGame: string | null, game: string, phase: Phase) => phase !== 'playing' && phase !== 'menu' && seenGame !== game;
// Back at the menu the phone forgets what it showed: entering a game again shows its summary again.
export const seenAfterPhase = (seenGame: string | null, phase: Phase) => (phase === 'menu' ? null : seenGame);
