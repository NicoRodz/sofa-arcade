// When the phone shows the "how to play" card: when joining and when the lobby picks a game it has not shown yet.
// Never during a round (a phone that reconnects mid-game must not get a card over the pad).
import type { Phase } from '@party/shared';

export const shouldShowHowTo = (seenGame: string | null, game: string, phase: Phase) => phase !== 'playing' && seenGame !== game;
