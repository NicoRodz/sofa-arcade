import { describe, expect, it } from 'vitest';
import { obstaculosManifest } from '@pichi/game-obstaculos/manifest';
import { pizzasManifest } from '@pichi/game-pizzas/manifest';
import { COMING_SOON, GAMES, GAME_IDS } from '@pichi/catalog';
import { gameProblems } from '@pichi/core/contract';
import { createRegistry } from '../registry';
import type { GameManifest } from './game';

describe('game contract: manifests and registry (experimental)', () => {
  it('the registry lists exactly the manifests the games publish, once each, in menu order', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['pizzas', 'obstaculos']); // ids are stable: they travel in the protocol and key the stats
    expect(GAME_IDS).toEqual(['pizzas', 'obstaculos']);
    expect(GAMES[0]).toBe(pizzasManifest);
    expect(GAMES[1]).toBe(obstaculosManifest);
  });
  it('every published manifest passes the authoring check and none is still announced as "soon"', () => {
    for (const m of [pizzasManifest, obstaculosManifest] as readonly GameManifest[]) {
      expect(gameProblems(m), m.id).toEqual([]);
      expect(COMING_SOON.map((s) => s.id)).not.toContain(m.id);
    }
  });
  it('createRegistry keeps declaration order, finds by id and refuses a duplicated or unknown id', () => {
    const reg = createRegistry([{ manifest: pizzasManifest }, { manifest: obstaculosManifest }]);
    expect(reg.ids()).toEqual(['pizzas', 'obstaculos']);
    expect(reg.list().map((g) => g.manifest.id)).toEqual(['pizzas', 'obstaculos']);
    expect(reg.get('obstaculos')?.manifest).toBe(obstaculosManifest);
    expect(reg.get('arena')).toBeUndefined();
    expect(() => reg.require('arena')).toThrow(/unknown game id arena/);
    expect(() => createRegistry([{ manifest: pizzasManifest }, { manifest: pizzasManifest }])).toThrow(/duplicated game id pizzas/);
  });
});
