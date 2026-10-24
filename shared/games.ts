// Game registry: the lobby lists these and the choice travels to the phones as an id.
export const PLATFORM = 'Pichiclub';

export const GAMES = [
  { id: 'pizzas', name: '¡Que salgan las pizzas!', blurb: 'Estira la masa, corta, hornea y entrega antes de que se acabe la paciencia.', players: '2 a 8 jugadores' },
] as const;

export type GameId = (typeof GAMES)[number]['id'];
export const GAME_IDS: readonly GameId[] = GAMES.map((g) => g.id);
export const DEFAULT_GAME: GameId = GAMES[0].id;
export const isGameId = (v: unknown): v is GameId => GAME_IDS.includes(v as GameId);
export const gameName = (id: GameId): string => GAMES.find((g) => g.id === id)?.name ?? id;
