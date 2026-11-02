// TeamSprite is opt-in: only Manchazo (games/arena) builds one. Pizzas and Obstaculos keep drawing their chefs with the existing rig, untouched.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../..');
const CHEF = join(ROOT, 'platform/screen/src/art/chef');
const USERS = /\b(TeamSprite|teamLookTextures|bakeTeamLayers|figureLayers|splitLayers)\b|\/team-(look|bake)['"]|\/look-layers['"]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(ts|html)$/.test(name) ? [p] : [];
  });
}

describe('TeamSprite is opt-in', () => {
  for (const game of ['pizzas', 'obstaculos']) {
    it(`${game} does not use TeamSprite or the team look`, () => {
      const files = sources(join(ROOT, 'games', game));
      expect(files.length).toBeGreaterThan(50); // the scan really read the game
      const users = files.filter((f) => USERS.test(readFileSync(f, 'utf8')));
      expect(users).toEqual([]);
    });
  }

  it('the only game that builds a TeamSprite is Manchazo (games/arena)', () => {
    const users = sources(join(ROOT, 'games')).filter((f) => /\bnew TeamSprite\(/.test(readFileSync(f, 'utf8')));
    expect(users.map((f) => f.slice(ROOT.length + 1))).toEqual(['games/arena/screen/match/scene-avatars.ts']);
  });

  it('the chef rig does not import the team look (its textures and its tint stay as they were)', () => {
    for (const f of ['rig.ts', 'look.ts', 'textures.ts'])
      expect(readFileSync(join(CHEF, f), 'utf8')).not.toMatch(/team-(look|bake)|look-layers/);
  });
});
