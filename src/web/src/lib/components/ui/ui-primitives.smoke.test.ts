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

  it("Table.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/table");
    expect(typeof Root).toBe("function");
  });

  it("Tabs.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/tabs");
    expect(typeof Root).toBe("function");
  });

  it("Sheet.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/sheet");
    expect(typeof Root).toBe("function");
  });

  it("Separator.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/separator");
    expect(typeof Root).toBe("function");
  });

  it("Skeleton is a Svelte 5 component function", async () => {
    const { Skeleton } = await import("$lib/components/ui/skeleton");
    expect(typeof Skeleton).toBe("function");
  });

  it("ScrollArea.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/scroll-area");
    expect(typeof Root).toBe("function");
  });

  it("Avatar.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/avatar");
    expect(typeof Root).toBe("function");
  });

  it("Breadcrumb.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/breadcrumb");
    expect(typeof Root).toBe("function");
  });

  it("Dialog.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/dialog");
    expect(typeof Root).toBe("function");
  });

  it("AlertDialog.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/alert-dialog");
    expect(typeof Root).toBe("function");
  });

  it("DropdownMenu.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/dropdown-menu");
    expect(typeof Root).toBe("function");
  });

  it("Popover.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/popover");
    expect(typeof Root).toBe("function");
  });

  it("Tooltip.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/tooltip");
    expect(typeof Root).toBe("function");
  });

  it("Command.Root is a Svelte 5 component function", async () => {
    const { Root } = await import("$lib/components/ui/command");
    expect(typeof Root).toBe("function");
  });

  it("Form.Field is a function", async () => {
    const { Field } = await import("$lib/components/ui/form");
    expect(typeof Field).toBe("function");
  });

  it("Toaster is a function", async () => {
    const { Toaster } = await import("$lib/components/ui/sonner");
    expect(typeof Toaster).toBe("function");
  });
});
