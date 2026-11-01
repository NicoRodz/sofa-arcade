// Development switches read from the screen's URL. Never set by the phones or the relay: they only change what the big screen offers.

/** `?soon=1`: the announced ("Próximamente") games become pickable in the start menu, so a game in development can be tried by hand. Off by default. */
export const soonEnabled = (search: string = typeof location === 'undefined' ? '' : location.search): boolean =>
  new URLSearchParams(search).get('soon') === '1';
