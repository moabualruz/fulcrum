import { describe, expect, test } from "bun:test";

import { AuthScreen } from "./auth.ts";
import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("AuthScreen", () => {
  test("renders Settings Auth labels and resolved values", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    new AuthScreen(renderer, {
      userId: "user_01",
      orgId: "org_01",
      orgName: "Acme",
      email: "admin@local",
      role: "owner",
      passkeyCount: 2,
    }).render();

    const output = tty.plainText();
    expect(output).toContain("Settings › Auth");
    expect(output).toContain("User Email");
    expect(output).toContain("admin@local");
    expect(output).toContain("User ID");
    expect(output).toContain("user_01");
    expect(output).toContain("Org");
    expect(output).toContain("Acme");
    expect(output).toContain("Role");
    expect(output).toContain("owner");
    expect(output).toContain("Passkeys");
    expect(output).toContain("2 passkeys enrolled");
    expect(output).toContain("Press [q] to go back");
  });
});
