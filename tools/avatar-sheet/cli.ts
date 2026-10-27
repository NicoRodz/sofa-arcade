// Avatar sample sheets in headless Chrome: bundles platform/core/src/avatar with esbuild, draws on a real canvas through Canvas2DPainter and saves PNGs.
// usage: PG_CDP=9500 npx tsx tools/avatar-sheet/cli.ts <outDir>      (sheets: parts-1, parts-2, combos, roles, far)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { WebSocket } from 'ws';
import { killTree } from '../proc/kill-tree';

const CDP = Number(process.env.PG_CDP ?? 9500);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = path.resolve(process.argv[2] ?? 'docs/avatar');
mkdirSync(out, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-page drawing code. `Avatar` is the esbuild global of the avatar index.
const PAGE = `
const SLOTS = ['#E63B2E','#2F7DE1','#3FA34D','#FFC21A','#8E5CD9','#FF7A1A','#FF5FA2','#1FB5A8'];
const BASE = { v: 1, g: 2, s: 0, hc: 1, sk: 1, hat: 0, gl: 0, bk: 0, cl: 0 };
function sheet(items, cols, scale, views, opts) {
  const cw = (views.length * 100 + 20) * scale, ch = 190 * scale;
  const rows = Math.ceil(items.length / cols);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(cols * cw); cv.height = Math.ceil(rows * ch);
  document.body.replaceChildren(cv);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#EFE6D2'; ctx.fillRect(0, 0, cv.width, cv.height);
  items.forEach((it, i) => {
    const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
    ctx.fillStyle = '#2A211C'; ctx.font = (11 * Math.max(scale, 1)) + 'px sans-serif';
    ctx.fillText(it.label, ox + 6, oy + 14);
    views.forEach((view, v) => {
      ctx.save();
      ctx.translate(ox + (v * 100 + 60) * scale, oy + 165 * scale);
      ctx.scale(scale, scale);
      const ap = Object.assign({}, BASE, it.ap);
      Avatar.drawAvatar(new Avatar.Canvas2DPainter(ctx), ap, { view, t: 0.7, slotColor: it.slot || SLOTS[i % 8], role: it.role });
      ctx.restore();
    });
  });
  return [cv.width, cv.height];
}
const V3 = ['front', 'side', 'back'];
const part = (label, ap) => ({ label, ap });
window.makeSheet = (name) => {
  if (name === 'parts-1') {
    const items = [];
    ['corto', 'coleta', 'melena'].forEach((n, s) => items.push(part('peinado ' + n, { s })));
    for (let hc = 0; hc < 5; hc++) items.push(part('pelo color ' + hc, { s: 2, hc }));
    for (let sk = 0; sk < 4; sk++) items.push(part('piel ' + sk, { sk }));
    ['jockey', 'lana', 'playero', 'bandana', 'corona'].forEach((n, i) => items.push(part('gorro ' + n, { hat: i + 1, s: 1 })));
    ['redondos', 'sol', 'fiesta'].forEach((n, i) => items.push(part('lentes ' + n, { gl: i + 1, s: 2 })));
    return sheet(items, 4, 1, V3);
  }
  if (name === 'parts-2') {
    const items = [];
    ['capa corta', 'capa larga', 'bufanda', 'alitas', 'mochila'].forEach((n, i) => items.push(part('espalda ' + n, { bk: i + 1 })));
    for (let cl = 0; cl < 11; cl++) items.push(part('ropa ' + cl, { cl }));
    return sheet(items, 4, 1, V3);
  }
  if (name === 'combos') {
    const items = [];
    for (let i = 0; i < 12; i++) items.push({ label: 'combo ' + i + ' ' + Avatar.encodeAppearance(Avatar.randomAppearance(Avatar.mulberry32(i + 1))), ap: Avatar.randomAppearance(Avatar.mulberry32(i + 1)) });
    return sheet(items, 4, 1, V3);
  }
  if (name === 'roles') {
    const ap = { g: 0, s: 1, hc: 3, sk: 2, hat: 5, gl: 3, bk: 2, cl: 8 };
    const items = [undefined, 'pizzas', 'obstaculos', 'arena'].map((role) => ({ label: 'rol ' + (role || 'lobby'), ap, role }));
    return sheet(items, 2, 1, V3);
  }
  const items = [];
  for (let i = 0; i < 8; i++) items.push({ label: '', ap: Avatar.randomAppearance(Avatar.mulberry32(i + 20)), slot: SLOTS[i] });
  return sheet(items, 8, 0.5, ['front']);
};`;

async function main() {
  const bundle = await build({
    entryPoints: [path.resolve('tools/avatar-sheet/entry.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'Avatar',
    target: 'es2022',
  });
  const profile = mkdtempSync(path.join(tmpdir(), 'avatar-sheet-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--force-color-profile=srgb',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    let targets: any[] = [];
    for (let i = 0; i < 50 && !targets.length; i++) {
      await sleep(200);
      try {
        targets = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).filter((t: any) => t.type === 'page');
      } catch {
        /* not up yet */
      }
    }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && pending.has(m.id)) pending.get(m.id)!(m);
    });
    const send = (method: string, params: object = {}) =>
      new Promise<any>((resolve, reject) => {
        const i = ++id;
        pending.set(i, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    const ev = async (expression: string) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
      return r.result.value;
    };
    await ev(bundle.outputFiles[0]!.text + '\n' + PAGE);
    await ev('document.body.style.margin = "0"');
    for (const name of ['parts-1', 'parts-2', 'combos', 'roles', 'far']) {
      const [w, h] = (await ev(`makeSheet(${JSON.stringify(name)})`)) as [number, number];
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
      writeFileSync(path.join(out, `avatar-${name}.png`), Buffer.from(r.data, 'base64'));
      console.log('saved', name, w, h);
    }
    ws.close();
  } finally {
    await killTree(chrome);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
