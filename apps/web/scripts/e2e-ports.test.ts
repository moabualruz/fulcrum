import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { allocatePortBlock } from "./e2e-ports";

describe("E2E port allocation", () => {
  test("allocates unique available ports without PID-derived ranges", async () => {
    const ports = await allocatePortBlock({ count: 3 });

    expect(new Set(ports).size).toBe(3);
    expect(ports.every((port) => Number.isInteger(port) && port > 0)).toBe(true);
  });

  test("rejects configured base ports that are already in use", async () => {
    const server = createServer();
    const busyPort = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not bind test port"));
          return;
        }
        resolve(address.port);
      });
    });

    try {
      await expect(allocatePortBlock({ count: 1, preferredBase: busyPort })).rejects.toThrow(`E2E port ${busyPort} is already in use`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
