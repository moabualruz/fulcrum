import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { isWorkflowStage, STAGE_DEFAULT_SUB, type WorkflowStage } from "$lib/components/app/route-map.ts";
import { resolveCaptureView, type CaptureStep, type CaptureView } from "$lib/components/app/capture-stage.ts";
import { createDocumentApiForEvent } from "$lib/server/document-api.ts";
import { traceFromHash } from "$lib/components/app/route-map.ts";

/**
 * `/<ws>/projects/<projId>/<stage>` — the canonical WorkflowStage workbench
 * route (IA-MAP §1). `<stage>` must be one of the six canonical WorkflowStages;
 * any other value is genuinely not a route and 404s — that is correct, an
 * unknown stage segment has no canonical home.
 *
 * The route resolves the active stage and its default sub-view; the rendered
 * workbench is a stage landing that links every existing feature view of the
 * stage to its canonical home, so a feature that moved under the stage model
 * stays findable (migration-strategy.md value-preservation item 4).
 *
 * The Capture stage (`prd-web-capture-stage-shell`) additionally resolves its
 * `?view=` sub-view (docs / drafts / promoted / inbox) and loads the real
 * project documents through the same document API the legacy `/docs` route
 * uses — preserving every tRPC call (value-preservation item 1). When the API
 * is unavailable (design-e2e harness skips the API server) the loader returns
 * an empty Capture surface, which is the honest `empty` data state.
 */

/** A document row as returned by the document API — the shape we project from. */
interface CaptureDocRow {
	id: string;
	title?: string;
	docType?: string;
	type?: string;
	frontmatter?: Record<string, unknown>;
	bodyMd?: string;
	body_md?: string;
	updatedAt?: string;
	updated_at?: string;
}

/** Project one document onto a Capture Step row for a sub-view. */
function toCaptureStep(doc: CaptureDocRow): CaptureStep {
	const body = doc.bodyMd ?? doc.body_md ?? "";
	const words = body.trim() ? body.trim().split(/\s+/).length : 0;
	const updated = doc.updatedAt ?? doc.updated_at ?? "";
	return {
		id: doc.id,
		title: doc.title ?? doc.id,
		preview: body.slice(0, 140),
		meta: `${words} words${updated ? ` · ${updated.slice(0, 10)}` : ""}`,
	};
}

/**
 * Resolve the maturity of a document from its frontmatter — the projection
 * key the Capture sub-views filter on. `draft` / `seedling` documents are
 * unsent drafts; a `promotedTo` reference marks a promoted capture.
 */
function docMaturity(doc: CaptureDocRow): "draft" | "promoted" | "doc" {
	const fm = doc.frontmatter ?? {};
	if (typeof fm.promotedTo === "string" && fm.promotedTo) return "promoted";
	const maturity = typeof fm.maturity === "string" ? fm.maturity : "";
	if (maturity === "draft" || maturity === "seedling") return "draft";
	return "doc";
}

/**
 * Load the Capture Step rows for the active sub-view. Filters the real
 * project document set onto the sub-view's projection. Returns `[]` on any
 * API failure — the workbench renders the locked empty state, never an error
 * page (migration-strategy.md "no 404"; the Capture stage always resolves).
 */
async function loadCaptureSteps(
	event: Parameters<PageServerLoad>[0],
	view: CaptureView,
): Promise<CaptureStep[]> {
	try {
		const docs = (await createDocumentApiForEvent(event).docs.list()) as CaptureDocRow[];
		const rows = docs.map((doc) => ({ doc, step: toCaptureStep(doc), maturity: docMaturity(doc) }));
		if (view === "drafts") return rows.filter((r) => r.maturity === "draft").map((r) => r.step);
		if (view === "promoted") {
			return rows
				.filter((r) => r.maturity === "promoted")
				.map((r) => {
					const fm = r.doc.frontmatter ?? {};
					const pill = fm.promotedStage === "build" ? "build" : "plan";
					return {
						...r.step,
						stagePill: pill as "plan" | "build",
						downstream: typeof fm.promotedTo === "string" ? `→ ${fm.promotedTo}` : undefined,
					};
				});
		}
		if (view === "inbox") return [];
		return rows.map((r) => r.step);
	} catch (apiError) {
		console.error("capture:list failed", apiError);
		return [];
	}
}

export const load: PageServerLoad = async (event) => {
	const stage = event.params.stage;
	if (!isWorkflowStage(stage)) {
		throw error(404, `Unknown workflow stage "${stage}"`);
	}
	const typed: WorkflowStage = stage;

	const base = {
		ws: event.params.ws,
		projId: event.params.projId,
		stage: typed,
		defaultSub: STAGE_DEFAULT_SUB[typed],
	};

	if (typed !== "capture") {
		return { ...base, captureView: null, captureSteps: [] as CaptureStep[], traceId: null };
	}

	// Capture stage — resolve the `?view=` sub-view and load real captures.
	const captureView = resolveCaptureView(event.url.searchParams.get("view"));
	const captureSteps = await loadCaptureSteps(event, captureView);
	// The trace hash never reaches the server; the client hydrates it. The
	// query form `?trace=<id>` is accepted as a server-readable fallback.
	const traceId =
		event.url.searchParams.get("trace") ?? traceFromHash(event.url.searchParams.get("trace"));

	return { ...base, captureView, captureSteps, traceId };
};
