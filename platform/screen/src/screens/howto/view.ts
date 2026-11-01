// The how-to card as a lit-html template, drawn into #howtoInner (view.html). The steps come as HTML from core's howToHtml, which the phones share.
import { html, renderInto, styleMap, unsafeHTML } from '../../ui/render';
import type { HowToView } from './model';

export const howToTemplate = (m: HowToView) => html`
  <h2>Cómo se juega</h2>
  <div class="gname" id="howtogame">${m.game}</div>
  <div id="howtobody">${unsafeHTML(m.bodyHtml)}</div>
  <div id="howtobar" style=${styleMap({ visibility: m.showBar ? 'visible' : 'hidden' })}><div id="howtofill" style=${styleMap({ width: m.fillWidth })}></div></div>
  <div id="howtohint">${m.seconds === null ? html`<b>H</b> o <b>Enter</b> para cerrar` : html`Empieza en <b>${m.seconds}</b> · Enter para saltar`}</div>
`;

export const renderHowTo = (m: HowToView): void => renderInto('howtoInner', howToTemplate(m));
