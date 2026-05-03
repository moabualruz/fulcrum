import { describe, expect, test } from "bun:test";
import { fileMimeCategory, shikiLangFromPath } from "./repo-files.ts";

describe("fileMimeCategory", () => {
  test("detects image from mime", () => {
    expect(fileMimeCategory("image/png", "foo.png")).toBe("image");
    expect(fileMimeCategory("image/jpeg", "photo.jpg")).toBe("image");
  });

  test("detects text from mime", () => {
    expect(fileMimeCategory("text/plain", "readme.txt")).toBe("text");
    expect(fileMimeCategory("text/typescript", "index.ts")).toBe("text");
  });

  test("infers image from extension when mime null", () => {
    expect(fileMimeCategory(null, "logo.png")).toBe("image");
    expect(fileMimeCategory(null, "photo.jpg")).toBe("image");
    expect(fileMimeCategory(null, "icon.svg")).toBe("image");
    expect(fileMimeCategory(null, "anim.gif")).toBe("image");
    expect(fileMimeCategory(null, "hero.webp")).toBe("image");
  });

  test("infers text from extension when mime null", () => {
    expect(fileMimeCategory(null, "index.ts")).toBe("text");
    expect(fileMimeCategory(null, "app.svelte")).toBe("text");
    expect(fileMimeCategory(null, "config.yaml")).toBe("text");
    expect(fileMimeCategory(null, "Makefile")).toBe("text"); // "makefile" ext in textExts
    expect(fileMimeCategory(null, "data.json")).toBe("text");
  });

  test("falls back to binary for unknown", () => {
    expect(fileMimeCategory(null, "archive.tar.gz")).toBe("binary");
    expect(fileMimeCategory("application/octet-stream", "blob.bin")).toBe("binary");
  });
});

describe("shikiLangFromPath", () => {
  test("maps common extensions", () => {
    expect(shikiLangFromPath("index.ts")).toBe("typescript");
    expect(shikiLangFromPath("app.tsx")).toBe("tsx");
    expect(shikiLangFromPath("style.css")).toBe("css");
    expect(shikiLangFromPath("main.py")).toBe("python");
    expect(shikiLangFromPath("lib.rs")).toBe("rust");
    expect(shikiLangFromPath("page.svelte")).toBe("svelte");
  });

  test("defaults to text for unknown extension", () => {
    expect(shikiLangFromPath("unknown.xyz")).toBe("text");
    expect(shikiLangFromPath("noext")).toBe("text");
  });
});
