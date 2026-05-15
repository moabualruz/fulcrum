/**
 * PWA offline feature tests (RED → GREEN).
 * Covers: feature flag gate, SW registration, background sync queue,
 * /offline route, install prompt, and doctor check.
 *
 * All SW APIs are mocked — no real browser required.
 */

const isVitestCli = process.argv.some((a) => a.includes("vitest"));

if (isVitestCli) {
  const { describe, it, expect, vi, beforeEach, afterEach } = await import("vitest");

  // ── helpers ──────────────────────────────────────────────────────────────

  function makeSwManager(featureOn: boolean) {
    // Dynamic import so the module re-evaluates with new env each test
    vi.resetModules();
    vi.stubEnv("FULCRUM_FEATURES", featureOn ? "pwa-offline" : "");
    return import("../../src/lib/pwa/sw-manager.ts");
  }

  // ── Feature flag: OFF ─────────────────────────────────────────────────────

  describe("pwa-offline feature flag OFF", () => {
    beforeEach(() => {
      vi.stubEnv("FULCRUM_FEATURES", "");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("isPwaEnabled() returns false when flag is absent", async () => {
      const { isPwaEnabled } = await import("../../src/lib/pwa/sw-manager.ts");
      expect(isPwaEnabled()).toBe(false);
    });

    it("registerSW() resolves null without touching navigator.serviceWorker", async () => {
      const registerMock = vi.fn();
      Object.defineProperty(globalThis, "navigator", {
        value: { serviceWorker: { register: registerMock } },
        configurable: true,
      });

      const { registerSW } = await import("../../src/lib/pwa/sw-manager.ts");
      const result = await registerSW();
      expect(result).toBeNull();
      expect(registerMock).not.toHaveBeenCalled();
    });
  });

  // ── Feature flag: ON ──────────────────────────────────────────────────────

  describe("pwa-offline feature flag ON", () => {
    let registrationMock: { active: { state: string } | null; ready: Promise<unknown> };

    beforeEach(() => {
      vi.stubEnv("FULCRUM_FEATURES", "pwa-offline");
      registrationMock = {
        active: { state: "activated" },
        ready: Promise.resolve({ active: { state: "activated" } }),
      };
      Object.defineProperty(globalThis, "navigator", {
        value: {
          serviceWorker: {
            register: vi.fn().mockResolvedValue(registrationMock),
            ready: registrationMock.ready,
          },
        },
        configurable: true,
        writable: true,
      });
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("isPwaEnabled() returns true when flag is set", async () => {
      const { isPwaEnabled } = await import("../../src/lib/pwa/sw-manager.ts");
      expect(isPwaEnabled()).toBe(true);
    });

    it("registerSW() calls navigator.serviceWorker.register with SW path", async () => {
      const { registerSW } = await import("../../src/lib/pwa/sw-manager.ts");
      const reg = await registerSW();
      expect(reg).not.toBeNull();
      expect((navigator.serviceWorker.register as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        "/sw.js",
        expect.objectContaining({ scope: "/" }),
      );
    });
  });

  // ── Background sync queue ─────────────────────────────────────────────────

  describe("BackgroundSyncQueue", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("enqueue() adds a mutation to the queue", async () => {
      const { BackgroundSyncQueue } = await import("../../src/lib/pwa/bg-sync.ts");
      const q = new BackgroundSyncQueue();
      await q.enqueue({ url: "/api/trpc/tasks.update", body: '{"id":"t1"}', method: "POST" });
      const pending = await q.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.url).toBe("/api/trpc/tasks.update");
    });

    it("replay() processes all queued mutations and clears the queue", async () => {
      const { BackgroundSyncQueue } = await import("../../src/lib/pwa/bg-sync.ts");
      const q = new BackgroundSyncQueue();
      await q.enqueue({ url: "/api/trpc/tasks.update", body: '{"id":"t1"}', method: "POST" });

      const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
      await q.replay(fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trpc/tasks.update",
        expect.objectContaining({ method: "POST", body: '{"id":"t1"}' }),
      );
      const pending = await q.getPending();
      expect(pending).toHaveLength(0);
    });

    it("replay() re-queues mutations that fail (fetch throws)", async () => {
      const { BackgroundSyncQueue } = await import("../../src/lib/pwa/bg-sync.ts");
      const q = new BackgroundSyncQueue();
      await q.enqueue({ url: "/api/trpc/tasks.update", body: '{"id":"t2"}', method: "POST" });

      const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
      await q.replay(fetchMock as unknown as typeof fetch);

      const pending = await q.getPending();
      expect(pending).toHaveLength(1); // still there
    });

    it("replay() re-queues mutations that return non-ok status", async () => {
      const { BackgroundSyncQueue } = await import("../../src/lib/pwa/bg-sync.ts");
      const q = new BackgroundSyncQueue();
      await q.enqueue({ url: "/api/trpc/tasks.update", body: '{"id":"t3"}', method: "POST" });

      const fetchMock = vi.fn().mockResolvedValue(new Response("Server Error", { status: 503 }));
      await q.replay(fetchMock as unknown as typeof fetch);

      const pending = await q.getPending();
      expect(pending).toHaveLength(1);
    });
  });

  // ── Install prompt ────────────────────────────────────────────────────────

  describe("InstallPromptManager", () => {
    beforeEach(() => {
      vi.resetModules();
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("showAfterDelay() fires callback after 30 000 ms", async () => {
      const { InstallPromptManager } = await import("../../src/lib/pwa/install-prompt.ts");
      const mgr = new InstallPromptManager();

      const fakeEvent = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "accepted" }) };
      mgr.captureEvent(fakeEvent as unknown as BeforeInstallPromptEvent);

      const cb = vi.fn();
      mgr.showAfterDelay(cb, 30_000);

      await vi.advanceTimersByTimeAsync(29_000);
      expect(cb).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_001);
      expect(cb).toHaveBeenCalledOnce();
    });

    it("showAfterDelay() does nothing when no event was captured", async () => {
      const { InstallPromptManager } = await import("../../src/lib/pwa/install-prompt.ts");
      const mgr = new InstallPromptManager();
      const cb = vi.fn();
      mgr.showAfterDelay(cb, 30_000);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ── Doctor check: web.pwa_sw ──────────────────────────────────────────────

  describe("doctor web.pwa_sw check", () => {
    beforeEach(() => {
      vi.resetModules();
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("returns skip when pwa-offline flag is OFF", async () => {
      vi.stubEnv("FULCRUM_FEATURES", "");
      const { checks } = await import("@platform-core/application/health-checks/checks/web.ts");
      const pwaCheck = checks.find((c) => c.name === "web.pwa_sw");
      expect(pwaCheck).toBeDefined();
      const result = await pwaCheck!.run();
      expect(result.status).toBe("ok"); // "skip" maps to "ok" per DoctorCheckResult schema
      expect(result.message).toContain("skip");
    });

    it("returns ok when flag ON and SW registration path exists", async () => {
      vi.stubEnv("FULCRUM_FEATURES", "pwa-offline");
      const { checks } = await import("@platform-core/application/health-checks/checks/web.ts");
      const pwaCheck = checks.find((c) => c.name === "web.pwa_sw");
      expect(pwaCheck).toBeDefined();
      const result = await pwaCheck!.run();
      expect(result.status).toBe("ok");
      expect(result.message).toContain("pwa-offline");
    });
  });
}

export {};
