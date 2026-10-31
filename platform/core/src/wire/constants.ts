// Wire constants, the phases and the small vocabularies of the protocol.
// Versions (additive, documented where the field is declared):
// 2: teams (modeId, teams and teamsLocked in the lobby config, teamId per player, 'setTeam' and 'you'). A v1 screen or phone never sends
// those fields and is read as cooperative with no teams assigned.
// 3: the Captain ('captain' to everyone, 'nav' from the Captain's phone to the screens, stamped with 'from'). Additive: an older screen or phone ignores both.
// 4: the versus result ('phase' results carries `result`: verdict, winner and every team's score). Additive: an older phone ignores it.
// 5: Ayudante ('assist' from a phone, and to the screens and that phone; PublicPlayer.assist). Additive: an older screen never reads it, an older phone never sends it.
// 6: Cocina escuela (phase 'school'; 'school' from the screen to one phone: its step and instruction; 'schoolDone' from a phone: it already did the school, or skips it; PublicPlayer.school). Additive:
// an older phone shows its normal pad in that phase and an older screen never enters it.
// One global version: a GameProtocol that changes the cable raises it (design pichiclub-refactor §2.1).
export const PROTOCOL_VERSION = 6;
export const WS_PATH = '/ws';
export const DEFAULT_ROOM = 'main';
export const INPUT_HZ = 30;
export const PING_MS = 1000;
export const DEADZONE = 0.15;
export const BUTTON_COUNT = 2; // btn bitmask: bit 0 = A, bit 1 = B
export const SLOT_GRACE_MS = 60_000; // a dropped phone keeps its slot this long
export const ROOM_CODE_LEN = 4;
export const PRESS_MOD = 65536;
// Chef palette (red, blue, green, yellow, purple, orange, pink, teal); the screen's chef specs use the same list.
export const COLORS = ['#E63B2E', '#2F7DE1', '#3FA34D', '#FFC21A', '#8E5CD9', '#FF7A1A', '#FF5FA2', '#1FB5A8'];

// menu: the Pichiclub start screen, where the screen picks the game (phones wait). lobby: that game's setup.
export const PHASES = ['menu', 'lobby', 'school', 'playing', 'results'] as const; // school: the guided practice round (shared/tutorial), between the lobby and the first match
export type Phase = (typeof PHASES)[number];

// R7: a short vibration on one phone (Android); iOS has no vibration API, so the phone flashes its colour instead.
// The screen decides when (it owns the game events); the phone only plays the pattern, in ms on / off / on...
// biome-ignore format: one line per pattern would add five lines to a file at its size cap
export const BUZZ_PATTERNS = { pick: [20], chop: [40], bad: [30, 40, 30], dash: [15], slip: [120], alert: [60, 40, 60] } as const satisfies Record<string, readonly number[]>;
export type BuzzKind = keyof typeof BUZZ_PATTERNS;
export const isBuzzKind = (v: unknown): v is BuzzKind => typeof v === 'string' && Object.hasOwn(BUZZ_PATTERNS, v);

// What the lobby has chosen; the screen owns it and the relay forwards it to the phones.
export const SEED_MAX = 2 ** 32;
export const isSeed = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SEED_MAX;
