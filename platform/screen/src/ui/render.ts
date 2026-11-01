// lit-html entry for the screens (F4d-2). A screen that re-renders by hand moves to a template: `screens/<name>/view.html` keeps the static skeleton
// (mounted by apps/screen/src/mount.ts), `screens/<name>/model.ts` is a pure function of state -> view model (tested without a DOM), and
// `screens/<name>/view.ts` is the template plus a `render<Name>(model)` that calls renderInto. Nothing here runs when the module loads.
import { render, type TemplateResult } from 'lit-html';

export { html } from 'lit-html';
export { styleMap } from 'lit-html/directives/style-map.js';
export { unsafeHTML } from 'lit-html/directives/unsafe-html.js';

// Draws `view` inside the element `id`; later calls update only the bindings that changed.
export const renderInto = (id: string, view: TemplateResult): void => {
  render(view, document.getElementById(id)!);
};
