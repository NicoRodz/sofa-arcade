// The timers of the results reveal (stars that drop, the verdict that appears): cleared whenever the results screen is built again or left.
// A leaf module so the state machine can clear them without importing any screen.
let timers: ReturnType<typeof setTimeout>[] = [];
export const laterInResults = (fn: () => void, ms: number) => {
  timers.push(setTimeout(fn, ms));
};
export const clearResultsTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};
