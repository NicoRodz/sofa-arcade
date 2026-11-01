// Builds the screen's markup from per-screen fragments (view.html, loaded with `?raw`) and mounts it before any module queries the DOM.
// A fragment marks where a game adds its own markup with a line `<!--slot:name-->`; apps/screen/src/mount.ts fills the slots.
const MARK = /<!--slot:([a-z-]+)-->/g;

// Fills every slot with its parts (joined by a newline, each without its trailing newline). A slot nobody fills, or a fill for a slot that does not exist, throws.
export function compose(template: string, slots: Readonly<Record<string, readonly string[]>> = {}): string {
  const seen = new Set<string>();
  const html = template.replace(MARK, (_m, name: string) => {
    const parts = slots[name];
    if (!parts?.length) throw new Error(`compose: slot "${name}" has no markup`);
    seen.add(name);
    return parts.map((p) => p.replace(/\n$/, '')).join('\n');
  });
  const stray = Object.keys(slots).filter((n) => !seen.has(n));
  if (stray.length) throw new Error(`compose: no slot named ${stray.map((n) => `"${n}"`).join(', ')}`);
  return html;
}

// The first thing main.ts does: the page body gets its markup in front of the module script.
export function mountScreens(html: string, body: HTMLElement = document.body): void {
  body.insertAdjacentHTML('afterbegin', html);
}
