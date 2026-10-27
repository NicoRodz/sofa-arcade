// Plan creador-personajes §3: clothes never use an identity colour. Every main clothes colour keeps a CIE76 distance (delta E) of at least 20
// from each of the 8 slot colours (identity is the ring and the tag, never the clothes).
import { describe, expect, it } from "vitest";
import { CLOTHES } from "@pichi/core/avatar/parts/data";
import { CHEFS } from "../tokens";

const lin = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) =>
    lin(parseInt(hex.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const xyz = [
    0.4124 * r + 0.3576 * g + 0.1805 * b,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    0.0193 * r + 0.1192 * g + 0.9505 * b,
  ];
  const [fx, fy, fz] = [xyz[0]! / 0.95047, xyz[1]!, xyz[2]! / 1.08883].map(
    (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116),
  ) as [number, number, number];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a: string, b: string) =>
  Math.hypot(
    ...(lab(a).map((v, i) => v - lab(b)[i]!) as [number, number, number]),
  );

describe("clothes vs slot colours", () => {
  it("deltaE of identical colours is 0 and of black/white about 100", () => {
    expect(deltaE("#112233", "#112233")).toBe(0);
    expect(deltaE("#000000", "#ffffff")).toBeCloseTo(100, 0);
  });
  it("every top and bottom is at least 20 from every slot colour (only the KNOWN exception)", () => {
    const bad: string[] = [];
    CLOTHES.forEach((c, id) => {
      for (const [part, col] of [
        ["top", c.top],
        ["bottom", c.bottom],
      ] as const)
        for (const ch of CHEFS) {
          const d = deltaE(col, ch.color);
          if (d < 20)
            bad.push(
              `cl ${id} ${part} ${col} vs ${ch.name} ${ch.color}: ${d.toFixed(1)}`,
            );
        }
    });
    expect(bad).toEqual([]);
  });
});
