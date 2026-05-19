import { describe, expect, test } from "bun:test";
import {
	ABORT_REASONS,
	SessionScreen,
	type SessionScreenCaller,
	type SessionScreenCheckpoint,
	type SessionScreenSession,
} from "@fulcrum/tui/screens/session-screen.ts";

function recordingCaller(initial: {
	session: SessionScreenSession;
	checkpoints: SessionScreenCheckpoint[];
}): SessionScreenCaller & { calls: string[] } {
	const calls: string[] = [];
	const caller: SessionScreenCaller = {
		async loadSession() {
			calls.push("load");
			return { session: initial.session, checkpoints: initial.checkpoints };
		},
		async pause(reason) {
			calls.push(`pause:${reason ?? ""}`);
		},
		async resume(from) {
			calls.push(`resume:${from ?? ""}`);
		},
		async abort(opts) {
			calls.push(`abort:${opts.reason}:${opts.note}`);
		},
		async checkpoint(label) {
			calls.push(`checkpoint:${label ?? ""}`);
		},
		async restore(id) {
			calls.push(`restore:${id}`);
		},
	};
	return Object.assign(caller, { calls });
}

function session(over: Partial<SessionScreenSession> = {}): SessionScreenSession {
	return {
		id: "s1",
		status: "active",
		mode: "build",
		model: "claude",
		pausedAt: null,
		pausedReason: null,
		currentCheckpointId: null,
		...over,
	};
}

function checkpoint(over: Partial<SessionScreenCheckpoint> = {}): SessionScreenCheckpoint {
	return {
		id: "cp1",
		turnIndex: 0,
		kind: "git",
		label: "Manual",
		createdAt: new Date("2026-05-19T00:00:00Z").toISOString(),
		...over,
	};
}

describe("SessionScreen", () => {
	test("loads session + checkpoints from the caller", async () => {
		const caller = recordingCaller({
			session: session(),
			checkpoints: [checkpoint()],
		});
		const screen = new SessionScreen({ caller });
		await screen.load();
		expect(screen.session?.id).toBe("s1");
		expect(screen.checkpoints).toHaveLength(1);
	});

	test(":pause palette dispatches to caller with reason", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":pause out for lunch");
		expect(caller.calls).toContain("pause:out for lunch");
		expect(screen.currentFlash).toContain("paused");
	});

	test(":resume passes optional checkpoint id", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":resume cp7");
		expect(caller.calls).toContain("resume:cp7");
	});

	test(":abort opens the draft and requires a note before confirm", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":abort");
		expect(screen.currentAbortDraft).not.toBeNull();
		await expect(screen.confirmAbort()).rejects.toThrow("note is required");
		screen.abortAppendNote("budget exceeded");
		screen.abortPickReason(1);
		await screen.confirmAbort();
		expect(caller.calls).toContain(`abort:${ABORT_REASONS[1]}:budget exceeded`);
		expect(screen.currentAbortDraft).toBeNull();
	});

	test(":checkpoint label inline confirms with label", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":checkpoint milestone-a");
		expect(screen.currentCheckpointDraft).not.toBeNull();
		await screen.confirmCheckpoint();
		expect(caller.calls).toContain("checkpoint:milestone-a");
	});

	test(":restore with id restores immediately", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [checkpoint()] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":restore cp1");
		expect(caller.calls).toContain("restore:cp1");
	});

	test(":restore without id opens checkpoint picker and confirm uses cursor", async () => {
		const caller = recordingCaller({
			session: session(),
			checkpoints: [checkpoint({ id: "cp1" }), checkpoint({ id: "cp2" })],
		});
		const screen = new SessionScreen({ caller });
		await screen.load();
		await screen.dispatchPalette(":restore");
		expect(screen.currentRestoreDraft).not.toBeNull();
		screen.moveRestoreCursor(1);
		await screen.confirmRestore();
		expect(caller.calls).toContain("restore:cp2");
	});

	test("Space menu confirm dispatches the selected action", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		screen.openMenu();
		// menuCursor starts at 0 (pause); move to checkpoint
		screen.menuCursor = 3;
		await screen.chooseMenuAction();
		expect(screen.currentCheckpointDraft).not.toBeNull();
	});

	test("rejects unknown palette commands", async () => {
		const caller = recordingCaller({ session: session(), checkpoints: [] });
		const screen = new SessionScreen({ caller });
		await screen.load();
		await expect(screen.dispatchPalette(":banana")).rejects.toThrow("unknown palette command");
	});
});
