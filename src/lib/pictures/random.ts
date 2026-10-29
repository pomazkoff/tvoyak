/** Детерминированный генератор (mulberry32): экран и сервер видят одно и то же. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перестановка 0..n-1 по зерну. */
export function seededOrder(n: number, seed: number): number[] {
  const random = seededRandom(seed);
  const order = Array.from({ length: n }, (_, index) => index);
  for (let index = n - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}
