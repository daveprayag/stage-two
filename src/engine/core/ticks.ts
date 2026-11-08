/** NSE price-tick rounding. RULEBOOK Entry mechanics (trigger at the high) and Stop rules (a few rupees below). */

const EPS = 1e-7;

function clean(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Round up to the next tick (a price already on the tick is unchanged). */
export function ceilTick(x: number, tick: number): number {
  return clean(Math.ceil(x / tick - EPS) * tick);
}

/** Round down to the tick (a price already on the tick is unchanged). */
export function floorTick(x: number, tick: number): number {
  return clean(Math.floor(x / tick + EPS) * tick);
}
