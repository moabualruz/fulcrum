import { afterEach, describe, expect, test } from "bun:test";

import { newUlid, testUlid } from "../../../services/platform-core/src/infrastructure/product-store/ids.ts";

const realDateNow = Date.now;
const realGetRandomValues = crypto.getRandomValues.bind(crypto);

afterEach(() => {
  Date.now = realDateNow;
  crypto.getRandomValues = realGetRandomValues;
});

describe("product kernel ids", () => {
  test("newUlid returns 26 Crockford characters with a stable encoded time prefix", () => {
    Date.now = () => 1_700_000_000_000;
    crypto.getRandomValues = ((array: Uint8Array) => {
      array.fill(7);
      return array;
    }) as Crypto["getRandomValues"];

    const id = newUlid();

    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(id.startsWith("01HF7YAT00")).toBe(true);
    expect(id.slice(10)).toBe("7777777777777777");
  });

  test("newUlid increments the random suffix monotonically within the same millisecond", () => {
    Date.now = () => 1_700_000_000_001;
    crypto.getRandomValues = ((array: Uint8Array) => {
      array.fill(0);
      return array;
    }) as Crypto["getRandomValues"];

    const first = newUlid();
    const second = newUlid();
    const third = newUlid();

    expect(first.slice(0, 10)).toBe(second.slice(0, 10));
    expect(second.slice(0, 10)).toBe(third.slice(0, 10));
    expect(first.slice(10)).toBe("0000000000000000");
    expect(second.slice(10)).toBe("0000000000000001");
    expect(third.slice(10)).toBe("0000000000000002");
    expect([first, second, third].sort()).toEqual([first, second, third]);
  });

  test("newUlid rolls over saturated random suffix without producing invalid characters", () => {
    Date.now = () => 1_700_000_000_002;
    crypto.getRandomValues = ((array: Uint8Array) => {
      array.fill(31);
      return array;
    }) as Crypto["getRandomValues"];

    const saturated = newUlid();
    const rolled = newUlid();

    expect(saturated.slice(10)).toBe("ZZZZZZZZZZZZZZZZ");
    expect(rolled.slice(10)).toBe("0000000000000000");
    expect(rolled).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  test("newUlid refreshes entropy when time advances", () => {
    let now = 1_700_000_000_003;
    let fill = 1;
    Date.now = () => now;
    crypto.getRandomValues = ((array: Uint8Array) => {
      array.fill(fill);
      return array;
    }) as Crypto["getRandomValues"];

    const first = newUlid();
    now += 1;
    fill = 2;
    const second = newUlid();

    expect(first.slice(0, 10)).not.toBe(second.slice(0, 10));
    expect(first.slice(10)).toBe("1111111111111111");
    expect(second.slice(10)).toBe("2222222222222222");
  });

  test("testUlid uppercases, pads, truncates, and replaces invalid characters", () => {
    expect(testUlid("abc")).toBe("ABC00000000000000000000000");
    expect(testUlid("abc!@#defghjkmnpqrstvwxyz-extra")).toBe("ABC000DEFGHJKMNPQRSTVWXYZ0");
    expect(testUlid("iIlLoOuU")).toBe("00000000000000000000000000");
  });
});
