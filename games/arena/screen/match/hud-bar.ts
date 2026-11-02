// The HUD's floor bar: orange grows from the left by its share of the floor, blue from the right by its own, and the grey between is what nobody has painted.
// The shares are the same ones the percent labels show (painted tiles / paintable tiles), so the bar and the numbers above it agree.
export interface FloorBar {
  orange: number; // px from the left edge
  blue: number; // px from the right edge
}

export function floorBar(counts: readonly number[], paintable: number, width: number): FloorBar {
  if (paintable <= 0) return { orange: 0, blue: 0 };
  const px = (n: number) => Math.min(width, Math.max(0, (width * n) / paintable));
  const orange = px(counts[0] ?? 0);
  return { orange, blue: Math.min(width - orange, px(counts[1] ?? 0)) };
}
