// DOM helpers shared by every screen of the shell. EXPERIMENTAL (F4b). The markup is mounted by apps/screen/src/mount.ts before any module runs.
export const $ = (id: string) => document.getElementById(id)!;
export const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const num0 = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '-');

// innerHTML only when the markup changed: a button that is being clicked or animated is not rebuilt on every render.
const cache = new Map<string, string>();
export const setHtml = (id: string, html: string) => {
  if (cache.get(id) !== html) {
    cache.set(id, html);
    $(id).innerHTML = html;
  }
};
