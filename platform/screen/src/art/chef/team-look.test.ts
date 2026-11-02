// TeamSprite on a fake scene: the textures are baked lazily, once per look (a look in both teams shares them) and the garment is tinted in MULTIPLY.
import { describe, expect, it, vi } from 'vitest';
import { defaultAppearance } from '@pichi/core/avatar';

const bake = vi.fn(() => ({ garment: {} as HTMLCanvasElement, body: {} as HTMLCanvasElement }));
vi.mock('./team-bake', () => ({ LOOK_BOX: { w: 120, h: 170, ox: 60, oy: 150 }, bakeTeamLayers: bake }));
const { TeamSprite, teamLookTextures } = await import('./team-look');

function fakeScene() {
  const have = new Set<string>();
  const images: Record<string, unknown>[] = [];
  const image = () => {
    const im: Record<string, unknown> = { tint: null, mode: null, texture: null, sets: 0 };
    const chain = (name: string, f?: (...a: never[]) => void) => {
      im[name] = (...a: never[]) => {
        f?.(...a);
        return im;
      };
    };
    chain('setOrigin');
    chain('setVisible');
    chain('setTintMode', ((m: number) => (im.mode = m)) as never);
    chain('setTint', ((c: number) => (im.tint = c)) as never);
    chain('setTexture', ((k: string) => {
      im.texture = k;
      (im.sets as number)++;
    }) as never);
    chain('setPosition');
    chain('setScale');
    chain('setAlpha');
    chain('setDepth');
    images.push(im);
    return im;
  };
  const scene = {
    add: { image },
    textures: { exists: (k: string) => have.has(k), addCanvas: (k: string) => have.add(k) },
  };
  return { scene: scene as never, have, images };
}

const ap = defaultAppearance(0);
const other = { ...ap, hat: 3 };

describe('TeamSprite', () => {
  it('creating a sprite bakes nothing; the first look bakes one pair of textures', () => {
    bake.mockClear();
    const { scene, have } = fakeScene();
    const s = new TeamSprite(scene, 'arena');
    expect(bake).not.toHaveBeenCalled();
    s.setLook(ap, 0xe69f00);
    expect(bake).toHaveBeenCalledTimes(1);
    expect(have.size).toBe(2);
  });

  it('the same look in both teams shares its textures; another look bakes its own', () => {
    bake.mockClear();
    const { scene, have } = fakeScene();
    new TeamSprite(scene, 'arena').setLook(ap, 0xe69f00);
    new TeamSprite(scene, 'arena').setLook(ap, 0x0072b2);
    expect(bake).toHaveBeenCalledTimes(1);
    new TeamSprite(scene, 'arena').setLook(other, 0x0072b2);
    expect(bake).toHaveBeenCalledTimes(2);
    expect(have.size).toBe(4);
    expect(teamLookTextures(scene, ap, 'arena')).toEqual(teamLookTextures(scene, ap, 'arena'));
    expect(bake).toHaveBeenCalledTimes(2);
  });

  it('the garment takes the team colour in MULTIPLY, the body takes none; setting the same look again does nothing', () => {
    bake.mockClear();
    const { scene, images } = fakeScene();
    const s = new TeamSprite(scene, 'arena').setLook(ap, 0x0072b2);
    const [garment, body] = images as [Record<string, unknown>, Record<string, unknown>];
    expect(garment.mode).toBe(0); // Phaser.TintModes.MULTIPLY
    expect(garment.tint).toBe(0x0072b2);
    expect(body.tint).toBeNull();
    expect(String(garment.texture)).toMatch(/_g$/);
    expect(String(body.texture)).toMatch(/_b$/);
    s.setLook(ap, 0x0072b2);
    expect(bake).toHaveBeenCalledTimes(1);
    expect(garment.sets).toBe(1); // the same look and team again touches no image
    expect(body.sets).toBe(1);
    s.setLook(ap, 0xe69f00); // the team changed (a reshuffle): a new tint, no new texture
    expect(garment.tint).toBe(0xe69f00);
    expect(bake).toHaveBeenCalledTimes(1);
  });
});
