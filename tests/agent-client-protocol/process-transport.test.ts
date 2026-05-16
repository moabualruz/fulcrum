import { describe, expect, test } from "bun:test";

import { ProcessTransport } from "@agent-client-protocol/application/transports/process.ts";

describe("ACP process transport", () => {
  test("spawns a stdio process and emits newline-delimited JSON messages", async () => {
    const transport = ProcessTransport.start({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", (chunk) => process.stdout.write(chunk));
        `,
      ],
    });
    const messages: string[] = [];
    transport.onMessage((message) => messages.push(message));

    await transport.send('{"jsonrpc":"2.0","method":"initialize"}');
    await waitFor(() => messages.length === 1);
    await transport.close();

    expect(messages).toEqual(['{"jsonrpc":"2.0","method":"initialize"}']);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1_000) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
