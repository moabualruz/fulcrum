import type { Hono } from "hono";
import { buildSetupDoctorReport, type SetupRepositoryPort } from "@fulcrum/core";
import type { CapabilityHealthRecord, SetupState } from "@fulcrum/shared";

export function registerDoctorRoutes(
  app: Hono,
  setupRepository: SetupRepositoryPort & { latest?: () => Promise<SetupState | undefined> },
  extraCapabilities?: () => Promise<CapabilityHealthRecord[]>
): void {
  app.get("/api/v1/doctor", async (context) => {
    const noNetwork =
      context.req.query("noNetwork") === "true" || context.req.query("no-network") === "true";
    return context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: buildSetupDoctorReport({
        setupState: setupRepository.latest
          ? await setupRepository.latest()
          : setupRepository.getLatest(),
        noNetwork,
        extraCapabilities: extraCapabilities ? await extraCapabilities() : []
      }),
      redactionStatus: "not_applicable"
    });
  });

  app.get("/api/v1/privacy/status", (context) =>
    context.json({
      schemaVersion: "1.0",
      status: "ok",
      data: {
        privacyMode: "local_only",
        networkDefault: "local-only",
        publicBindAllowed: false
      },
      redactionStatus: "not_applicable"
    })
  );
}
