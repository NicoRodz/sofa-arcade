// The platform's own mark: a sofa whose cushions are arcade buttons, and the two-tone "Sofa Arcade" title. Lives in the platform (not in a game),
// so the menu and every game lobby wear the same logo. Styling: ../menu/brand.css.
import '../menu/brand.css';

const SOFA = `<svg viewBox="0 0 136 116" aria-hidden="true"><g stroke="#1E1220" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
<path d="M26 100v10M110 100v10" fill="none"/>
<rect x="18" y="14" width="100" height="56" rx="18" fill="#FF6B57"/>
<rect x="24" y="58" width="88" height="40" rx="12" fill="#FF8A78"/>
<rect x="5" y="46" width="30" height="58" rx="13" fill="#FF6B57"/>
<rect x="101" y="46" width="30" height="58" rx="13" fill="#FF6B57"/>
<circle class="btn b1" cx="52" cy="66" r="14" fill="#2EC4B6"/>
<circle class="btn b2" cx="84" cy="66" r="14" fill="#FFC83D"/>
</g></svg>`;

/** Draws the sofa into the #logo host (decorative: the h1 carries the name). */
export function mountSofaLogo(host: HTMLElement) {
  host.innerHTML = SOFA;
}

/** The hub title. In the menu it is the brand: first word cream, the rest mustard (textContent stays the plain name). Anywhere else it is plain text. */
export function paintTitle(el: HTMLElement, name: string, brand: boolean) {
  const key = brand ? `b:${name}` : '';
  if (!brand) {
    if (el.dataset.brand || el.textContent !== name) el.textContent = name;
    delete el.dataset.brand;
    return;
  }
  if (el.dataset.brand === key) return;
  const [first = '', ...rest] = name.split(' ');
  const w1 = document.createElement('span');
  w1.className = 'w1';
  w1.textContent = first;
  const w2 = document.createElement('span');
  w2.className = 'w2';
  w2.textContent = rest.join(' ');
  el.replaceChildren(w1, document.createTextNode(' '), w2);
  el.dataset.brand = key;
}
