/**
 * RED → GREEN tests for gated real-time collab (issue #21).
 * Flag OFF stays mock-based; flag ON requires real provider dependencies.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { isCollabEnabled, isWebRTCFallbackEnabled, getFeatureFlags } from "./feature-flags.js";
import { MockCollabProvider } from "./mock-provider.js";
import type { CollabUser } from "./types.js";
import {
	CollabProviderConfigError,
	createCollabProvider,
	resolveHocuspocusUrl,
} from "./provider-factory.js";

// ---- Feature flag helpers ---------------------------------------------------

describe("feature-flags", () => {
	it("OFF by default (empty env)", () => {
		expect(isCollabEnabled("")).toBe(false);
	});

	it("OFF when other flags set but not collab", () => {
		expect(isCollabEnabled("foo,bar")).toBe(false);
	});

	it("ON when real-time-collab-server in env", () => {
		expect(isCollabEnabled("real-time-collab-server")).toBe(true);
	});

	it("ON with multiple flags", () => {
		expect(isCollabEnabled("foo,real-time-collab-server,bar")).toBe(true);
	});

	it("WebRTC fallback OFF when collab OFF", () => {
		expect(isWebRTCFallbackEnabled("collab-fallback-webrtc")).toBe(false);
	});

	it("WebRTC fallback ON when both flags present", () => {
		expect(isWebRTCFallbackEnabled("real-time-collab-server,collab-fallback-webrtc")).toBe(true);
	});

	it("getFeatureFlags parses CSV", () => {
		const flags = getFeatureFlags("a,b,c");
		expect(flags.has("a")).toBe(true);
		expect(flags.has("d")).toBe(false);
	});
});

// ---- MockCollabProvider — flag OFF path ------------------------------------

describe("MockCollabProvider — flag OFF (disconnected)", () => {
	it("starts disconnected", () => {
		const p = new MockCollabProvider();
		expect(p.connected).toBe(false);
	});

	it("updateCursor is a no-op when disconnected", () => {
		const p = new MockCollabProvider();
		// Should not throw
		p.updateCursor(0, 5);
		expect(p.connected).toBe(false);
	});
});

// ---- MockCollabProvider — flag ON path ------------------------------------

describe("MockCollabProvider — flag ON (connected)", () => {
	let provider: MockCollabProvider;
	const alice: CollabUser = { id: "alice", name: "Alice", color: "#f00" };
	const bob: CollabUser = { id: "bob", name: "Bob", color: "#00f" };

	beforeEach(() => {
		provider = new MockCollabProvider();
		provider.setUser(alice);
		provider.connect();
	});

	it("connected after connect()", () => {
		expect(provider.connected).toBe(true);
	});

	it("presence includes self after connect", () => {
		const states: { users: CollabUser[] }[] = [];
		provider.onPresenceChange((s) => states.push(s));
		// Re-trigger presence by simulating another join
		provider.simulateUserJoin(bob);
		expect(states.length).toBeGreaterThan(0);
		const latest = states[states.length - 1];
		expect(latest.users.some((u) => u.id === "alice")).toBe(true);
		expect(latest.users.some((u) => u.id === "bob")).toBe(true);
	});

	it("presence removes user on leave", () => {
		provider.simulateUserJoin(bob);
		const states: { users: CollabUser[] }[] = [];
		provider.onPresenceChange((s) => states.push(s));
		provider.simulateUserLeave("bob");
		const latest = states[states.length - 1];
		expect(latest.users.some((u) => u.id === "bob")).toBe(false);
	});

	it("cursor appears on updateCursor", () => {
		const cursors: ReturnType<typeof provider.onCursorChange extends (cb: (c: infer C) => void) => unknown ? (cb: (c: infer C) => void) => unknown : never>[] = [];
		const collected: Parameters<Parameters<typeof provider.onCursorChange>[0]>[0][] = [];
		provider.onCursorChange((c) => collected.push(...c));
		provider.updateCursor(3, 7);
		expect(collected.length).toBeGreaterThan(0);
		expect(collected[0].user.id).toBe("alice");
		expect(collected[0].anchor).toBe(3);
		expect(collected[0].head).toBe(7);
	});

	it("remote cursor rendered via simulateRemoteCursor", () => {
		const collected: Parameters<Parameters<typeof provider.onCursorChange>[0]>[0][] = [];
		provider.onCursorChange((c) => collected.push(...c));
		provider.simulateRemoteCursor({ userId: "bob", user: bob, anchor: 1, head: 4 });
		expect(collected.some((c) => c.userId === "bob")).toBe(true);
	});

	it("cursor callback unsubscribes", () => {
		let count = 0;
		const unsub = provider.onCursorChange(() => count++);
		provider.updateCursor(0, 1);
		expect(count).toBe(1);
		unsub();
		provider.updateCursor(2, 3);
		expect(count).toBe(1); // no more calls
	});

	it("disconnect removes user from presence", () => {
		const states: { users: CollabUser[] }[] = [];
		provider.onPresenceChange((s) => states.push(s));
		provider.disconnect();
		expect(provider.connected).toBe(false);
		const latest = states[states.length - 1];
		expect(latest.users.some((u) => u.id === "alice")).toBe(false);
	});
});

// ---- createCollabProvider factory ------------------------------------------

describe("createCollabProvider factory", () => {
	it("flag OFF → returns MockCollabProvider (not connected)", async () => {
		const p = await createCollabProvider({
			docId: "doc-1",
			user: { id: "u1", name: "User", color: "#aaa" },
			featuresEnv: "", // OFF
		});
		expect(p.connected).toBe(false);
	});

	it("flag ON outside browser without Hocuspocus URL fails instead of using mock", async () => {
		await expect(createCollabProvider({
			docId: "doc-1",
			user: { id: "u1", name: "User", color: "#aaa" },
			featuresEnv: "real-time-collab-server",
		})).rejects.toBeInstanceOf(CollabProviderConfigError);
	});

	it("derives browser Hocuspocus URL from current origin without hardcoded localhost", () => {
		const previousWindow = (globalThis as Record<string, unknown>).window;
		(globalThis as Record<string, unknown>).window = {
			location: { protocol: "https:", host: "fulcrum.local" },
		};

		expect(resolveHocuspocusUrl()).toBe("wss://fulcrum.local/yjs");
		(globalThis as Record<string, unknown>).window = previousWindow;
	});

	it("flag ON WebRTC fallback → returns provider (not crashed)", async () => {
		const p = await createCollabProvider({
			docId: "doc-1",
			user: { id: "u1", name: "User", color: "#aaa" },
			featuresEnv: "real-time-collab-server,collab-fallback-webrtc",
		});
		// y-webrtc not installed, falls back to mock
		expect(p).toBeTruthy();
	});
});

// ---- BellWebSocket ----------------------------------------------------------

describe("BellWebSocket factory — flag OFF", () => {
	it("returns null when disabled", async () => {
		const { createBellWebSocket } = await import("./bell-websocket.js");
		const result = createBellWebSocket(
			{ url: "/api/ws/notify", onMessage: () => {} },
			false, // OFF
		);
		expect(result).toBeNull();
	});
});

describe("BellWebSocket — flag ON (mock WebSocket)", () => {
	it("attempts connection to /api/ws/notify when enabled", async () => {
		const { createBellWebSocket } = await import("./bell-websocket.js");
		const openUrls: string[] = [];

		// Patch global WebSocket for this test
		const OrigWS = (globalThis as Record<string, unknown>).WebSocket;
		(globalThis as Record<string, unknown>).WebSocket = class MockWS {
			readyState = 0;
			url: string;
			onopen: (() => void) | null = null;
			onmessage: ((e: { data: string }) => void) | null = null;
			onclose: (() => void) | null = null;
			constructor(url: string) {
				this.url = url;
				openUrls.push(url);
			}
			close() {}
		};

		const ws = createBellWebSocket(
			{ url: "/api/ws/notify", onMessage: () => {} },
			true,
		);
		expect(ws).not.toBeNull();
		expect(openUrls).toContain("/api/ws/notify");

		ws?.close();
		(globalThis as Record<string, unknown>).WebSocket = OrigWS;
	});
});
