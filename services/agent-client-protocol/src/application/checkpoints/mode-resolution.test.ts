import { describe, expect, test } from "bun:test";
import { resolveCheckpointMode } from "./mode-resolution.ts";

describe("resolveCheckpointMode", () => {
	test("session override wins over user and org", () => {
		const out = resolveCheckpointMode({
			sessionOverride: "git",
			userPreference: "file",
			orgPreference: "message",
		});
		expect(out).toEqual({ mode: "git", source: "session" });
	});

	test("user wins over org when no session override", () => {
		const out = resolveCheckpointMode({
			sessionOverride: null,
			userPreference: "file",
			orgPreference: "git",
		});
		expect(out).toEqual({ mode: "file", source: "user" });
	});

	test("org applies when neither session nor user set", () => {
		const out = resolveCheckpointMode({
			sessionOverride: null,
			userPreference: null,
			orgPreference: "message",
		});
		expect(out).toEqual({ mode: "message", source: "org" });
	});

	test("defaults to auto when nothing is set", () => {
		const out = resolveCheckpointMode({});
		expect(out).toEqual({ mode: "auto", source: "default" });
	});

	test("ignores unknown values silently and falls through", () => {
		const out = resolveCheckpointMode({
			sessionOverride: "lol",
			userPreference: "",
			orgPreference: "GIT",
		});
		expect(out).toEqual({ mode: "git", source: "org" });
	});
});
