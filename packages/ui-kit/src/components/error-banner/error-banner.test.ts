import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ErrorBannerRoot from "./error-banner.svelte";

describe("ErrorBanner", () => {
  test("renders the title + message + trace id with banner role/aria-live", () => {
    const { body } = render(ErrorBannerRoot, {
      props: {
        title: "Could not save the task",
        message: "Network request failed before reaching the server.",
        traceId: "tr_err_5xx",
      },
    });

    expect(body).toContain('role="alert"');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('data-slot="error-banner"');
    expect(body).toContain('data-tone="error"');
    expect(body).toContain('data-surface="block"');
    expect(body).toContain("Could not save the task");
    expect(body).toContain("Network request failed before reaching the server.");
    expect(body).toContain('data-slot="error-banner-trace"');
    expect(body).toContain("tr_err_5xx");
    expect(body).toContain('data-slot="error-banner-trace-copy"');
  });

  test("renders a Retry button when onRetry is provided", () => {
    const { body } = render(ErrorBannerRoot, {
      props: {
        title: "Could not save the task",
        onRetry: () => {},
      },
    });

    expect(body).toContain('data-slot="error-banner-retry"');
    expect(body).toContain("Retry");
  });

  test("omits the Retry button when onRetry is absent", () => {
    const { body } = render(ErrorBannerRoot, {
      props: { title: "Could not save the task" },
    });

    expect(body).not.toContain('data-slot="error-banner-retry"');
  });

  test("threads the surface attribute through for row/form/drawer/block placement", () => {
    for (const surface of ["row", "form", "drawer", "block"] as const) {
      const { body } = render(ErrorBannerRoot, {
        props: { title: "x", surface },
      });
      expect(body).toContain(`data-surface="${surface}"`);
    }
  });

  test("never renders toast classes (matrix bans toasts for errors)", () => {
    const { body } = render(ErrorBannerRoot, {
      props: { title: "x", traceId: "tr" },
    });
    expect(body.toLowerCase()).not.toContain("toast");
  });

  test("never emits 'Contact support' copy (matrix rejected)", () => {
    const { body } = render(ErrorBannerRoot, {
      props: {
        title: "Could not save the task",
        message: "Network request failed before reaching the server.",
      },
    });
    expect(body.toLowerCase()).not.toContain("contact support");
  });
});
