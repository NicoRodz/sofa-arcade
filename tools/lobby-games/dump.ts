// DUMP_DIR: the normalized DOM (lit markers stripped) and the computed style of each panel, written per state so a before and an after run can be diffed.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../capture/session';

const DUMP = process.env.DUMP_DIR;
const NORM = `(el) => el.outerHTML.replace(/<!--[\\s\\S]*?-->/g, '')`;
const STYLE_PROPS = [
  'display',
  'position',
  'width',
  'height',
  'color',
  'backgroundColor',
  'backgroundImage',
  'fontSize',
  'fontWeight',
  'fontFamily',
  'letterSpacing',
  'textTransform',
  'borderTopWidth',
  'borderTopColor',
  'borderRadius',
  'marginTop',
  'marginLeft',
  'paddingTop',
  'paddingLeft',
  'gridColumnStart',
  'gridColumnEnd',
  'opacity',
  'whiteSpace',
  'overflow',
  'textAlign',
  'zIndex',
  'transform',
];

export async function dump(c: Ctx, name: string, ids: string[]) {
  if (!DUMP) return;
  mkdirSync(DUMP, { recursive: true });
  const dom = await c.cdp.eval<Record<string, string>>(
    `Object.fromEntries(${JSON.stringify(ids)}.map((id) => [id, (${NORM})(document.getElementById(id))]))`,
  );
  writeFileSync(path.join(DUMP, `${name}.dom.json`), JSON.stringify(dom, null, 1));
  const styles = await c.cdp.eval<string[]>(
    `${JSON.stringify(ids)}.flatMap((id) => [document.getElementById(id), ...document.getElementById(id).querySelectorAll('*')].map((e, i) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return id + '#' + i + ' ' + e.tagName + '.' + e.className + ' ' + ${JSON.stringify(STYLE_PROPS)}.map((p) => p + '=' + s[p]).join(';') + ';rect=' + [r.x, r.y, r.width, r.height].map(Math.round).join(','); }))`,
  );
  writeFileSync(path.join(DUMP, `${name}.style.txt`), styles.join('\n'));
}
