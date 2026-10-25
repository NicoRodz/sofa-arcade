import { describe, expect, it } from 'vitest';
import { obstaculosManifest } from '@pichi/game-obstaculos/manifest';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import type { GameManifest } from '@pichi/core/contract';
import { games, registerGames, type ScreenGame } from './game';

// Only the manifest matters to the registry; the hooks are exercised by the screen itself (they need Phaser and the DOM).
const stub = (manifest: GameManifest) => ({ manifest }) as unknown as ScreenGame;

describe('screen game registry (experimental contract)', () => {
  it('registers one ScreenGame per published manifest, in menu order', () => {
    registerGames([stub(pizzasManifest), stub(obstaculosManifest)]);
    expect(games().ids()).toEqual(['pizzas', 'obstaculos']);
    expect(games().require('obstaculos').manifest).toBe(obstaculosManifest);
  });
  it('refuses to start when a published manifest has no ScreenGame', () => {
    expect(() => registerGames([stub(pizzasManifest)])).toThrow(/missing obstaculos/);
  });
  it('refuses a ScreenGame whose manifest is not published, and a duplicated one', () => {
    expect(() => registerGames([stub(pizzasManifest), stub(obstaculosManifest), stub({ ...pizzasManifest, id: 'arena' })])).toThrow(
      /unknown arena/,
    );
    expect(() => registerGames([stub(pizzasManifest), stub(pizzasManifest), stub(obstaculosManifest)])).toThrow(
      /duplicated game id pizzas/,
    );
  });
});
