import { plugin } from "bun";
import { compile } from "svelte/compiler";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";

// Bun has no built-in `.svelte` loader. Register one before any dynamic import
// resolves, then use dynamic `import()` inside each test so module resolution
// happens after the loader is in place. Pure-logic test — no DOM, no render.
plugin({
  name: "svelte-loader",
  async setup(build) {
    const { compileModule } = await import("svelte/compiler");
    build.onLoad({ filter: /\.svelte$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const { js } = compile(source, {
        filename: args.path,
        generate: "client",
        dev: false,
      });
      return { contents: js.code, loader: "js" };
    });
    // bits-ui ships `.svelte.js` files that use Svelte 5 runes ($state, etc).
    // `compileModule` lowers runes to plain JS for runtime execution.
    build.onLoad({ filter: /\.svelte\.(js|ts)$/ }, (args) => {
      const source = readFileSync(args.path, "utf8");
      const { js } = compileModule(source, {
        filename: args.path,
        generate: "client",
        dev: false,
      });
      return { contents: js.code, loader: "js" };
    });
  },
});

describe("shadcn-svelte primitives smoke", () => {
  it("Button is a Svelte 5 component function", async () => {
    const { Button } = await import("$lib/components/ui/button");
    expect(typeof Button).toBe("function");
  });

  it("Card.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/card");
    expect(typeof Root).toBe("function");
  });

  it("Badge is a Svelte 5 component function", async () => {
    const { Badge } = await import("$lib/components/ui/badge");
    expect(typeof Badge).toBe("function");
  });

  it("Input is a Svelte 5 component function", async () => {
    const { Input } = await import("$lib/components/ui/input");
    expect(typeof Input).toBe("function");
  });

  it("Label is a Svelte 5 component function", async () => {
    const { Label } = await import("$lib/components/ui/label");
    expect(typeof Label).toBe("function");
  });

  it("Textarea is a Svelte 5 component function", async () => {
    const { Textarea } = await import("$lib/components/ui/textarea");
    expect(typeof Textarea).toBe("function");
  });

  it("Select.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/select");
    expect(typeof Root).toBe("function");
  });
});
