// CIE76 colour distance between two '#rrggbb' colours (used by the legibility tests of the art).
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const xyz = [0.4124 * r + 0.3576 * g + 0.1805 * b, 0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0193 * r + 0.1192 * g + 0.9505 * b];
  const [fx, fy, fz] = [xyz[0]! / 0.95047, xyz[1]!, xyz[2]! / 1.08883].map((t) =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116,
  ) as [number, number, number];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a: string, b: string) => Math.hypot(...(lab(a).map((v, i) => v - lab(b)[i]!) as [number, number, number]));
