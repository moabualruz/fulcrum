import { describe, expect, it } from "bun:test";

import type { SyncItem } from "../../../services/integration-hub/src/application/external-connectors/index.ts";
import { PlaneConnector } from "../../../services/integration-hub/src/application/external-connectors/plane.ts";

describe("PlaneConnector", () => {
  it("is disabled by default and requires explicit enablement before import", async () => {
    const connector = new PlaneConnector({ url: "https://plane.example.com", token: "token", workspaceSlug: "fulcrum" });

    await expect(connector.importHistory({ store: { async upsertBatch() {} } })).rejects.toThrow(
      "connector disabled: connector-plane",
    );
  });

  it("imports historical Plane issues across pages and upserts mapped batches", async () => {
    const requests: Request[] = [];
    const batches: SyncItem[][] = [];
    const connector = new PlaneConnector({
      url: "https://plane.example.com",
      token: "token",
      workspaceSlug: "fulcrum",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const url = new URL(request.url);
        if (url.searchParams.get("cursor") === null) {
          return Response.json({
            next_cursor: "cursor-1",
            results: [
              {
                id: "pln-1",
                sequence_id: 101,
                name: "Import Plane history",
                state: { name: "In Progress", group: "started" },
                priority: "high",
                module: { name: "Module A" },
                assignees: [{ email: "owner@example.com", display_name: "Owner" }],
                labels: [{ name: "history" }],
              },
            ],
          });
        }

        return Response.json({
          next_cursor: null,
          results: [
            {
              id: "pln-2",
              sequence_id: 102,
              name: "Second Plane issue",
              state: { name: "Done", group: "completed" },
              module: { name: "Module B" },
              assignees: [{ display_name: "Planner" }],
              labels: [{ name: "api" }],
            },
          ],
        });
      },
    });
    connector.enable();

    const result = await connector.importHistory({
      batchSize: 1,
      store: {
        async upsertBatch(kind, items) {
          expect(kind).toBe("plane");
          batches.push(items);
        },
      },
    });

    expect(result).toEqual({ imported: 2, upserted: 2, batches: 2, errors: [] });
    expect(requests.map((request) => new URL(request.url).searchParams.get("cursor"))).toEqual([null, "cursor-1"]);
    expect(batches).toEqual([
      [
        {
          externalId: "101",
          data: {
            id: "pln-1",
            title: "Import Plane history",
            status: "in-progress",
            priority: "high",
            sprint: "Module A",
            assignee: "owner@example.com",
            labels: ["history"],
          },
        },
      ],
      [
        {
          externalId: "102",
          data: {
            id: "pln-2",
            title: "Second Plane issue",
            status: "done",
            priority: undefined,
            sprint: "Module B",
            assignee: "Planner",
            labels: ["api"],
          },
        },
      ],
    ]);
  });
});
