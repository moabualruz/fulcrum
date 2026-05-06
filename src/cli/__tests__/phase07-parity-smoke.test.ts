import { describe, expect, test } from "bun:test";
import { run as runArtifactsCli, type ArtifactsClient } from "../artifacts.ts";
import { NotificationsScreen } from "../../tui/screens/notifications.ts";

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

describe("phase 07 cross-surface parity smoke", () => {
  test("artifact rows expose provenance and retention fields through CLI JSON", async () => {
    const artifact = {
      id: "artifact-1",
      filename: "report.txt",
      mime: "text/plain",
      sizeBytes: "12",
      archived: false,
      retentionStatus: "kept-latest",
      previewKind: "text",
      runId: "run-1",
      digest: "sha256:abc",
      checksumSha256: "abc",
      path: "org/project/run/report.txt",
      provenance: {
        sourcePath: "reports/report.txt",
        producerKind: "agent-run",
        producerId: "run-1",
      },
    };
    const client = {
      list: async () => [artifact],
    } as unknown as ArtifactsClient;

    const cap = captureStdout();
    try {
      await runArtifactsCli(["list", "--json"], client);
    } finally {
      cap.restore();
    }

    const rows = JSON.parse(cap.lines.join("\n"));
    expect(rows[0]).toMatchObject({
      id: "artifact-1",
      retentionStatus: "kept-latest",
      previewKind: "text",
      runId: "run-1",
      digest: "sha256:abc",
    });
    expect(rows[0].provenance).toMatchObject({
      sourcePath: "reports/report.txt",
      producerKind: "agent-run",
    });
    expect(JSON.stringify(rows)).not.toContain("body_path");
  });

  test("notification unread/list flow matches CLI data and TUI render semantics", async () => {
    const notifications = [
      {
        id: "n1",
        title: "Artifact delivered",
        body: "Webhook delivery failed",
        read: false,
        archived: false,
        sourceKind: "artifact",
        sourceId: "artifact-1",
        createdAt: "2026-05-05T12:00:00.000Z",
      },
    ];
    const screen = new NotificationsScreen({
      caller: {
        notify: {
          unreadCount: async () => ({ count: 1 }),
          list: async () => notifications,
          markRead: async () => ({ ok: true }),
          mute: async () => ({ ok: true }),
          rules: {
            list: async () => [],
          },
        },
      },
    });

    await screen.load();
    const rendered: string[] = [];
    screen.render({
      writeln: (line = "") => rendered.push(line),
      separator: () => rendered.push("---"),
    } as never);

    expect(rendered.join("\n")).toContain("[unread] Artifact delivered");
    expect(rendered.join("\n")).toContain("Bell: 1");
  });

  test("webhook settings route exposes delivery debug metadata without secrets", async () => {
    process.env["FULCRUM_FEATURES"] = "notify-webhook";
    const mod = await import("../../web/src/routes/settings/integrations/webhooks/+page.server.ts");
    const rows = mod._mapWebhookDeliveries([
      {
        id: "delivery-1",
        eventType: "artifact.created",
        status: "retrying",
        attempts: 2,
        responseStatus: 503,
        responseBodyExcerpt: "service unavailable",
        errorCode: "http_503",
        errorMessage: "failed",
        nextAttemptAt: "2026-05-05T12:01:00.000Z",
        lastAttemptAt: "2026-05-05T12:00:00.000Z",
        signingSecret: "plain-secret",
        vapidPrivateKey: "private-key",
        smtpPassword: "smtp-password",
      },
    ]);

    expect(rows[0]).toMatchObject({
      id: "delivery-1",
      event: "artifact.created",
      deliveryStatus: "retrying",
      attempts: 2,
      responseCode: 503,
      responseBodyExcerpt: "service unavailable",
      errorCode: "http_503",
      nextRetryAt: "2026-05-05T12:01:00.000Z",
      lastAttemptAt: "2026-05-05T12:00:00.000Z",
    });
    expect(JSON.stringify(rows)).not.toContain("plain-secret");
    expect(JSON.stringify(rows)).not.toContain("private-key");
    expect(JSON.stringify(rows)).not.toContain("smtp-password");
  });
});
