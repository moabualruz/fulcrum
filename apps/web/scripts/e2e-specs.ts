import { existsSync } from "node:fs";
import path from "node:path";

export type E2eProject = "real-e2e" | "design-e2e";

export interface ResolvedE2eSpecs {
	project: E2eProject;
	specs: string[];
}

function normalizeSpecPath(spec: string): string {
	return spec.split(path.sep).join("/");
}

function resolveSpecProject(spec: string, cwd: string): { project: E2eProject; spec: string } {
	const normalized = normalizeSpecPath(spec);
	const directPath = path.isAbsolute(spec) ? spec : path.join(cwd, spec);

	if (normalized.includes("tests/design-e2e/")) return { project: "design-e2e", spec: normalized };
	if (normalized.includes("tests/e2e/")) return { project: "real-e2e", spec: normalized };

	if (existsSync(directPath)) {
		const relative = normalizeSpecPath(path.relative(cwd, directPath));
		if (relative.includes("tests/design-e2e/")) return { project: "design-e2e", spec: relative };
		if (relative.includes("tests/e2e/")) return { project: "real-e2e", spec: relative };
	}

	const realCandidate = path.join("tests/e2e", normalized);
	if (existsSync(path.join(cwd, realCandidate))) return { project: "real-e2e", spec: realCandidate };

	const designCandidate = path.join("tests/design-e2e", normalized);
	if (existsSync(path.join(cwd, designCandidate))) return { project: "design-e2e", spec: designCandidate };

	return { project: "real-e2e", spec: normalized };
}

export function resolveRequestedE2eSpecs(requestedSpecs: string[], cwd = process.cwd()): ResolvedE2eSpecs {
	if (requestedSpecs.length === 0) {
		return { project: "real-e2e", specs: ["tests/e2e/wave-0a-foundation.spec.ts"] };
	}

	const resolved = requestedSpecs.map((spec) => resolveSpecProject(spec, cwd));
	const projects = new Set(resolved.map((item) => item.project));
	if (projects.size > 1) {
		throw new Error("Cannot mix real-e2e and design-e2e specs in one test:e2e run; run them separately.");
	}

	return {
		project: resolved[0]?.project ?? "real-e2e",
		specs: resolved.map((item) => item.spec),
	};
}
