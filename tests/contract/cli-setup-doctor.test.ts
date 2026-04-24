import { describe, expect, it } from "vitest";
import { doctorCommand } from "../../apps/cli/src/commands/doctor.js";
import { setupApplyCommand, setupPreviewCommand } from "../../apps/cli/src/commands/setup.js";
import type { SetupState } from "@fulcrum/shared";

class MemorySetupRepository {
  state?: SetupState;

  save(state: SetupState): SetupState {
    this.state = state;
    return state;
  }

  getLatest(): SetupState | undefined {
    return this.state;
  }
}

describe("CLI setup and doctor contracts", () => {
  it("returns setup preview JSON without mutation", () => {
    const response = setupPreviewCommand("/tmp/fulcrum-test");
    expect(response.status).toBe("ok");
    expect(response.data.networkDefault).toBe("local-only");
    expect(response.data.changes).toContain("initialize /tmp/fulcrum-test/fulcrum.sqlite");
  });

  it("applies setup and doctor reports managed local state", async () => {
    const setupRepository = new MemorySetupRepository();
    const response = await setupApplyCommand(
      {
        setupRepository,
        initializeDatabase: () => undefined
      },
      "/tmp/fulcrum-test"
    );
    expect(response.data.status).toBe("applied");

    const doctor = doctorCommand({ setupRepository, noNetwork: true });
    expect(doctor.data.networkDefault).toBe("local-only");
    expect(
      doctor.data.capabilities.find((capability) => capability.capabilityId === "cap_local_state")
        ?.state
    ).toBe("managed");
  });
});
