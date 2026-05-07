import { describe, expect, test } from "bun:test";

import { FULCRUM_REQUEST_ID_HEADER } from "@fulcrum/server/trpc/context.ts";
import { GET } from "./+server.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("api/trpc route handler", () => {
  test("returns request id header on actual response", async () => {
    const response = await GET({
      request: new Request("http://localhost/api/trpc/health.ping"),
      locals: {
        session: null,
        orgId: null,
        em: null,
        container: null,
      },
    } as never);

    expect(response.headers.get(FULCRUM_REQUEST_ID_HEADER)).toMatch(UUID_RE);
  });
});
