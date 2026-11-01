import { describe, expect, it } from 'vitest';
import { kudosView } from './model';

describe('results kudos view model', () => {
  it('keeps the lines and shows the block when there is something to say', () => {
    expect(kudosView(['Nico rescató pizzas del fuego'])).toEqual({ lines: ['Nico rescató pizzas del fuego'], hidden: false });
  });
  it('hides the block when nobody did anything', () => {
    expect(kudosView([])).toEqual({ lines: [], hidden: true });
  });
});
