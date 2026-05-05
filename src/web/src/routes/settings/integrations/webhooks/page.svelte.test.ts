import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

type PageProps = {
  data: {
    subscriptions: Array<{ id: string; url: string; eventPattern: string; createdAt: string }>;
    deliveries: Array<{
      id: string;
      event: string;
      deliveryStatus: string;
      attempts: number;
      nextAttemptAt: string | null;
      lastAttemptAt: string | null;
      responseCode: number | null;
      responseBodyExcerpt: string | null;
      errorCode: string | null;
      errorMessage: string | null;
    }>;
    channels: unknown[];
  };
  form: Record<string, unknown> | null;
};

describe("/settings/integrations/webhooks +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders webhook delivery debug columns and resend action", () => {
    const { body } = render(Page, {
      props: {
        data: {
          subscriptions: [],
          channels: [],
          deliveries: [
            {
              id: "delivery-1",
              event: "artifact.created",
              deliveryStatus: "retrying",
              attempts: 2,
              nextAttemptAt: "2026-05-05T12:01:00.000Z",
              lastAttemptAt: "2026-05-05T12:00:00.000Z",
              responseCode: 503,
              responseBodyExcerpt: "service unavailable",
              errorCode: "http_503",
              errorMessage: "failed",
            },
          ],
        },
        form: null,
      },
    });

    expect(body).toContain("Attempts");
    expect(body).toContain("Next attempt");
    expect(body).toContain("Response");
    expect(body).toContain("service unavailable");
    expect(body).toContain("data-webhook-resend");
  });
});
