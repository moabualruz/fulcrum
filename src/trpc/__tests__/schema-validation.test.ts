import { describe, expect, test } from "bun:test";

import { CreateTaskBody } from "../../test-support/product-fixtures.ts";
import {
  ListDocumentsInputSchema,
} from "../schemas/documents.ts";
import {
  ArtifactIdInputSchema,
  UploadArtifactInputSchema,
} from "../../test-support/product-fixtures.ts";
import { ListRunsInputSchema } from "../schemas/runs.ts";
import { ListMemoriesInputSchema } from "../schemas/memories.ts";
import {
  ListReposInputSchema,
  SyncRepoInputSchema,
} from "../schemas/repos.ts";
import { SearchQueryInputSchema } from "../schemas/search.ts";
import {
  IdInputSchema,
  ListNotificationsInputSchema,
} from "../schemas/notifications.ts";

describe("Phase 08 tRPC schema validation", () => {
  test("rejects malformed task payloads", () => {
    expect(() => CreateTaskBody.parse({ title: "" })).toThrow();
  });

  test("rejects malformed docs payloads", () => {
    expect(() => ListDocumentsInputSchema.parse({ orgId: "not-a-uuid" })).toThrow();
  });

  test("rejects malformed search payloads", () => {
    expect(() => SearchQueryInputSchema.parse({ q: "", limit: 101 })).toThrow();
  });

  test("rejects malformed notification payloads", () => {
    expect(() => IdInputSchema.parse({ id: "not-a-uuid" })).toThrow();
    expect(() => ListNotificationsInputSchema.parse({ limit: 101 })).toThrow();
  });

  test("rejects malformed artifact payloads", () => {
    expect(() => ArtifactIdInputSchema.parse({ id: "not-a-uuid" })).toThrow();
    expect(() =>
      UploadArtifactInputSchema.parse({ filename: "", mime: "", sizeBytes: "abc" }),
    ).toThrow();
  });

  test("rejects malformed repo payloads", () => {
    expect(() => SyncRepoInputSchema.parse({ repoId: "not-a-uuid" })).toThrow();
    expect(ListReposInputSchema.parse({ includeArchived: true })).toEqual({
      includeArchived: true,
    });
  });

  test("rejects malformed run and memory payloads", () => {
    expect(() => ListRunsInputSchema.parse({ orgId: "not-a-uuid" })).toThrow();
    expect(() => ListMemoriesInputSchema.parse({ orgId: "not-a-uuid" })).toThrow();
  });
});
