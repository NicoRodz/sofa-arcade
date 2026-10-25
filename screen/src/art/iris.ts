// Pizza-shaped iris: a crust ring whose huge box-shadow hides the screen; closes, runs the swap, then opens (500 ms each).
export function iris(swap: () => void, done?: () => void) {
  const el = document.getElementById('iris')!;
  el.style.display = 'block';
  const big = { width: '260vmax', height: '260vmax' },
    none = { width: '0px', height: '0px' };
  const close = el.animate([big, none], { duration: 500, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
  close.onfinish = () => {
    swap();
    const open = el.animate([none, big], { duration: 500, easing: 'cubic-bezier(.2,.4,.5,1)', fill: 'forwards' });
    open.onfinish = () => {
      el.style.display = 'none';
      close.cancel();
      open.cancel();
      done?.();
    };
  };
}
