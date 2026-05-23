import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { resolveRequestedE2eSpecs } from "./e2e-specs";

let tempDirs: string[] = [];

function tempWebRoot(): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "fulcrum-e2e-specs-"));
	tempDirs.push(root);
	mkdirSync(path.join(root, "tests/e2e"), { recursive: true });
	mkdirSync(path.join(root, "tests/design-e2e"), { recursive: true });
	writeFileSync(path.join(root, "tests/e2e/wave-0a-foundation.spec.ts"), "");
	writeFileSync(path.join(root, "tests/e2e/real-flow.spec.ts"), "");
	writeFileSync(path.join(root, "tests/design-e2e/build-graph.spec.ts"), "");
	return root;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("resolveRequestedE2eSpecs", () => {
	test("defaults to the real foundation E2E spec", () => {
		expect(resolveRequestedE2eSpecs([], tempWebRoot())).toEqual({
			project: "real-e2e",
			specs: ["tests/e2e/wave-0a-foundation.spec.ts"],
		});
	});

	test("maps bare design spec names to the design E2E project", () => {
		expect(resolveRequestedE2eSpecs(["build-graph.spec.ts"], tempWebRoot())).toEqual({
			project: "design-e2e",
			specs: ["tests/design-e2e/build-graph.spec.ts"],
		});
	});

	test("keeps bare real spec names on the real E2E project", () => {
		expect(resolveRequestedE2eSpecs(["real-flow.spec.ts"], tempWebRoot())).toEqual({
			project: "real-e2e",
			specs: ["tests/e2e/real-flow.spec.ts"],
		});
	});

	test("rejects mixed real and design spec requests", () => {
		expect(() => resolveRequestedE2eSpecs(["real-flow.spec.ts", "build-graph.spec.ts"], tempWebRoot())).toThrow(
			"Cannot mix real-e2e and design-e2e specs",
		);
	});
});
