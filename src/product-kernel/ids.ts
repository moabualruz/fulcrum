const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number): string {
  let n = now;
  const out = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    out[i] = CROCKFORD[n % 32] as string;
    n = Math.floor(n / 32);
  }
  return out.join("");
}

function encodeRandom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += CROCKFORD[(bytes[i] as number) % 32];
  }
  return out;
}

export function newUlid(): string {
  const time = encodeTime(Date.now());
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return time + encodeRandom(random);
}

export function testUlid(seed: string): string {
  const padded = seed.toUpperCase().padEnd(26, "0").slice(0, 26);
  return Array.from(padded, (ch) => (CROCKFORD.includes(ch) ? ch : "0")).join("");
}
