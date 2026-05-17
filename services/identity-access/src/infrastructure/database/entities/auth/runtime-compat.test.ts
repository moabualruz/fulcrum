import { describe, expect, test } from "bun:test";

describe("auth TypeORM entity runtime compatibility", () => {
  test("loads auth entity classes under Bun without decorator runtime errors", async () => {
    const entities = await import("./index.ts");

    expect(entities.Org).toBeFunction();
    expect(entities.Session).toBeFunction();
    expect(entities.User).toBeFunction();
  });
});
