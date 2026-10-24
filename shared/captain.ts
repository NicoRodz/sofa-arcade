// Captain (the crown) and the remote D-pad of Pichiclub's menus. Pure: the relay elects the captain, the screen validates the
// remote intents, the phone only draws buttons. See plans/menus-desde-celular-votacion.md (F0).

// What the Captain's D-pad can say. Each one stands for a key the Mac keyboard already has (NAV_TO_KEY), so a phone can do nothing
// that the keyboard cannot: up/down/left/right = arrows, ok = Enter (pick, start, skip the how-to card, back to the lobby),
// back = Esc, help = H (open the how-to card in the lobby).
export const NAV_KEYS = ['up', 'down', 'left', 'right', 'ok', 'back', 'help'] as const;
export type NavKey = (typeof NAV_KEYS)[number];
export const isNavKey = (v: unknown): v is NavKey => typeof v === 'string' && (NAV_KEYS as readonly string[]).includes(v);

// KeyboardEvent.key of the key each intent replaces: the screen feeds it to the same handler as a real key press.
export const NAV_TO_KEY: Record<NavKey, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ok: 'Enter', back: 'Escape', help: 'h' };
export const navToKey = (k: NavKey): string => NAV_TO_KEY[k];

// The Captain is the first player who joined and is connected now (lowest id: ids only grow, a rejoin with the token keeps its id).
// If they drop, the crown passes to the next one who joined; if they come back they take it again. null: nobody is connected.
export function captainOf(players: readonly { id: number; connected: boolean }[]): number | null {
  let best: number | null = null;
  for (const p of players) if (p.connected && (best === null || p.id < best)) best = p.id;
  return best;
}

// The screen's check: only the current Captain's phone moves the menus. `from` is the id the relay bound to the socket
// (never one that came in a payload), so a phone cannot pose as the Captain.
export const acceptNav = (captainId: number | null, from: unknown): boolean => typeof from === 'number' && from === captainId;

// The Mac keyboard keeps the last word: a remote intent that lands right after a key press is dropped, so the two never pile up.
export const KEYBOARD_QUIET_MS = 300;
export const remoteBlocked = (lastKeyAt: number | null, now: number, quietMs = KEYBOARD_QUIET_MS): boolean => lastKeyAt !== null && now - lastKeyAt < quietMs;

// The D-pad lives on the Captain's phone in every screen but the round itself (there the stick and the buttons own the screen).
export const remoteVisible = (isCaptain: boolean, joined: boolean, phase: string): boolean => isCaptain && joined && phase !== 'playing';
