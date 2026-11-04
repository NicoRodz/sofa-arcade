// The on-screen sound hint of a game that owns its AudioContext: "Haz clic para activar el sonido" while the context is blocked, "Sonido silenciado (M)" when muted.
import { hintText } from '../mixer';

export interface HintDoc {
  createElement(tag: 'div'): { style: { cssText: string; display: string }; textContent: string | null };
  body: { appendChild(el: never): unknown };
}
export interface SoundHint {
  refresh(): void;
}

const STYLE =
  'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:5;padding:6px 14px;border-radius:8px;background:#000a;color:#ccc;font:13px system-ui,sans-serif;pointer-events:none';

export function createSoundHint(running: () => boolean, muted: () => boolean, doc: HintDoc = document as unknown as HintDoc): SoundHint {
  const el = doc.createElement('div');
  el.style.cssText = STYLE;
  doc.body.appendChild(el as never);
  const refresh = () => {
    const text = hintText({ running: running(), muted: muted() });
    el.textContent = text;
    el.style.display = text ? '' : 'none';
  };
  refresh();
  return { refresh };
}
