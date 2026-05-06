const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  let n = now;
  const out = new Array<string>(10);
  for (let i = 9; i >= 0; i -= 1) {
    out[i] = CROCKFORD[n % 32] as string;
    n = Math.floor(n / 32);
  }
  return out.join("");
}

function incrementRandom(value: number[]): number[] {
  const next = value.slice();
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if ((next[i] as number) < 31) {
      next[i] = (next[i] as number) + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
}

export function newUlid(): string {
  const now = Date.now();
  const time = encodeTime(now);
  if (now === lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    lastTime = now;
    lastRandom = Array.from(random, (byte) => byte % 32);
  }
  return time + lastRandom.map((index) => CROCKFORD[index] as string).join("");
}
