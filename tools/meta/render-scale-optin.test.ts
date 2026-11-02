// F6: the 3840x2160 backbuffer is opt-in per game. Only Manchazo (folder games/arena) asks for it; Pizzas and Obstaculos do not, so their pictures stay as they were.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const screenGame = (game: string) => readFileSync(join(ROOT, 'games', game, 'screen/game.ts'), 'utf8');
const OPT_IN = /^\s*renderScale:\s*2\b/m;

describe('renderScale opt-in', () => {
  it('Manchazo asks for 2', () => {
    expect(screenGame('arena')).toMatch(OPT_IN);
  });
  it('Pizzas and Obstaculos do not set renderScale at all', () => {
    for (const g of ['pizzas', 'obstaculos']) {
      expect(screenGame(g), `games/${g}/screen/game.ts`).not.toMatch(/\brenderScale\b/);
    }
  });
});
