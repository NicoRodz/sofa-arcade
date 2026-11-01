// Arena has nothing to configure: its lobby declares it, so the shell hides the setup panel (and the "Dificultad" box that would be alone in it).
import { obstaculosScreen } from '@pichi/game-obstaculos/screen';
import { pizzasScreen } from '@pichi/game-pizzas/screen';
import { describe, expect, it } from 'vitest';
import { arenaScreen } from '../screen';

describe('lobby with no options', () => {
  it('Arena declares noOptions; the games that do have options do not', () => {
    expect(arenaScreen.lobby.noOptions).toBe(true);
    expect(pizzasScreen.lobby.noOptions).toBeUndefined();
    expect(obstaculosScreen.lobby.noOptions).toBeUndefined();
  });
});
