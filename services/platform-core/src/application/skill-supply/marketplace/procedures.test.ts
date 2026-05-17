import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  browse,
  fetch,
  publish,
  verify,
  install,
} from "./procedures.ts";
import { resetRegistry, seedRegistry } from "./registry.ts";
import {
  FeatureDisabledError,
  SignatureVerificationError,
  ListingNotFoundError,
  type MarketplaceListing,
} from "./types.ts";

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    slug: "test-skill",
    version: "1.0.0",
    publisher: "alice",
    description: "A test skill",
    tags: ["test", "demo"],
    stars: 0,
    signature: "c2lnOmFiYzEyMw==", // non-empty placeholder
    contentHash: "abc123",
    ...overrides,
  };
}

describe("marketplace procedures", () => {
  let origFeatures: string | undefined;

  beforeEach(() => {
    origFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "skill-marketplace";
    resetRegistry();
  });

  afterEach(() => {
    if (origFeatures !== undefined) process.env["FULCRUM_FEATURES"] = origFeatures;
    else delete process.env["FULCRUM_FEATURES"];
  });

  // ── Flag-off guard on all five procedures ──

  describe("flag-off guard", () => {
    beforeEach(() => {
      delete process.env["FULCRUM_FEATURES"];
    });

    test("browse throws FeatureDisabledError when flag off", () => {
      expect(() => browse({})).toThrow(FeatureDisabledError);
    });

    test("fetch throws FeatureDisabledError when flag off", () => {
      expect(() => fetch({ slug: "x" })).toThrow(FeatureDisabledError);
    });

    test("publish throws FeatureDisabledError when flag off", () => {
      expect(() =>
        publish({ slug: "x", version: "1.0.0", description: "", tags: [], content: "", privateKey: "" }),
      ).toThrow(FeatureDisabledError);
    });

    test("verify throws FeatureDisabledError when flag off", () => {
      expect(() => verify({ slug: "x" })).toThrow(FeatureDisabledError);
    });

    test("install throws FeatureDisabledError when flag off", () => {
      expect(() => install({ slug: "x" })).toThrow(FeatureDisabledError);
    });
  });

  // ── browse ──

  describe("browse", () => {
    test("returns all listings when no filter", () => {
      seedRegistry([makeListing({ slug: "a" }), makeListing({ slug: "b" })]);
      const results = browse({});
      expect(results).toHaveLength(2);
    });

    test("filters by query (slug match)", () => {
      seedRegistry([
        makeListing({ slug: "jq-skill", description: "JSON processor" }),
        makeListing({ slug: "bat-skill", description: "cat replacement" }),
      ]);
      const results = browse({ query: "jq" });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe("jq-skill");
    });

    test("filters by query (description match)", () => {
      seedRegistry([
        makeListing({ slug: "a", description: "JSON processor" }),
        makeListing({ slug: "b", description: "cat replacement" }),
      ]);
      const results = browse({ query: "cat" });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe("b");
    });

    test("filters by tags", () => {
      seedRegistry([
        makeListing({ slug: "a", tags: ["cli", "json"] }),
        makeListing({ slug: "b", tags: ["web"] }),
      ]);
      const results = browse({ tags: ["json"] });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe("a");
    });

    test("query + tags combined filter", () => {
      seedRegistry([
        makeListing({ slug: "jq", tags: ["cli"], description: "json" }),
        makeListing({ slug: "jq-web", tags: ["web"], description: "json web" }),
        makeListing({ slug: "bat", tags: ["cli"], description: "cat" }),
      ]);
      const results = browse({ query: "jq", tags: ["cli"] });
      expect(results).toHaveLength(1);
      expect(results[0]!.slug).toBe("jq");
    });
  });

  // ── fetch ──

  describe("fetch", () => {
    test("returns listing by slug", () => {
      seedRegistry([makeListing({ slug: "my-skill" })]);
      const result = fetch({ slug: "my-skill" });
      expect(result.slug).toBe("my-skill");
    });

    test("throws ListingNotFoundError for unknown slug", () => {
      expect(() => fetch({ slug: "nope" })).toThrow(ListingNotFoundError);
    });
  });

  // ── publish ──

  describe("publish", () => {
    test("creates listing with signature", () => {
      const result = publish({
        slug: "new-skill",
        version: "1.0.0",
        description: "brand new",
        tags: ["fresh"],
        content: "# My Skill\nDoes stuff.",
        privateKey: "fake-key",
      });
      expect(result.slug).toBe("new-skill");
      expect(result.signature.length).toBeGreaterThan(0);
      expect(result.contentHash.length).toBeGreaterThan(0);
    });

    test("published listing browseable", () => {
      publish({
        slug: "pub-skill",
        version: "1.0.0",
        description: "published",
        tags: [],
        content: "content",
        privateKey: "key",
      });
      const results = browse({ query: "pub-skill" });
      expect(results).toHaveLength(1);
    });
  });

  // ── verify ──

  describe("verify", () => {
    test("returns valid for listing with signature", () => {
      seedRegistry([makeListing({ slug: "signed", signature: "abc", contentHash: "def" })]);
      const { valid } = verify({ slug: "signed" });
      expect(valid).toBe(true);
    });

    test("throws for unknown slug", () => {
      expect(() => verify({ slug: "nope" })).toThrow(ListingNotFoundError);
    });
  });

  // ── install ──

  describe("install", () => {
    test("returns listing on successful install", () => {
      seedRegistry([makeListing({ slug: "good-skill" })]);
      const result = install({ slug: "good-skill" });
      expect(result.slug).toBe("good-skill");
    });

    test("throws SignatureVerificationError for unsigned skill", () => {
      seedRegistry([makeListing({ slug: "bad-skill", signature: "" })]);
      expect(() => install({ slug: "bad-skill" })).toThrow(SignatureVerificationError);
    });

    test("throws ListingNotFoundError for unknown slug", () => {
      expect(() => install({ slug: "nope" })).toThrow(ListingNotFoundError);
    });
  });
});
