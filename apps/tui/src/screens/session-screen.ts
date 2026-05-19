/**
 * SessionScreen — TUI surface for the AI Assist session lifecycle.
 *
 * Mirrors `fulcrum session …` CLI verbs. Palette commands (`:pause`,
 * `:resume`, `:abort`, `:checkpoint [label]`, `:restore <id>`) and a
 * Space-triggered menu both dispatch to the same `SessionScreenCaller`
 * boundary so tests can exercise every action without spinning up
 * Nest/TypeORM.
 *
 * Copy uses "AI Assist" consistently — never the raw "ACP" acronym
 * (matrix rule 48).
 */

import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export type SessionMenuAction =
	| "pause"
	| "resume"
	| "abort"
	| "checkpoint"
	| "restore"
	| null;

export const ABORT_REASONS = [
	"user-cancel",
	"dangerous-output",
	"wrong-context",
	"cost-cap",
] as const;
export type AbortReason = (typeof ABORT_REASONS)[number];

export interface SessionScreenSession {
	id: string;
	status: string;
	mode: string | null;
	model: string | null;
	pausedAt: string | null;
	pausedReason: string | null;
	currentCheckpointId: string | null;
}

export interface SessionScreenCheckpoint {
	id: string;
	turnIndex: number;
	kind: "git" | "file" | "message";
	label: string;
	createdAt: string;
}

export interface SessionScreenCaller {
	loadSession(): Promise<{ session: SessionScreenSession; checkpoints: SessionScreenCheckpoint[] }>;
	pause(reason: string | null): Promise<void>;
	resume(fromCheckpointId: string | null): Promise<void>;
	abort(input: { reason: AbortReason; note: string }): Promise<void>;
	checkpoint(label: string | null): Promise<void>;
	restore(checkpointId: string): Promise<void>;
}

export interface SessionScreenOptions {
	caller: SessionScreenCaller;
}

export type AbortField = "reason" | "note";

interface AbortDraft {
	reasonIndex: number;
	note: string;
	field: AbortField;
}

interface CheckpointDraft {
	label: string;
}

interface RestoreDraft {
	cursor: number;
}

export class SessionScreen {
	session: SessionScreenSession | null = null;
	checkpoints: SessionScreenCheckpoint[] = [];
	menuOpen = false;
	menuCursor = 0;
	private abortDraft: AbortDraft | null = null;
	private checkpointDraft: CheckpointDraft | null = null;
	private restoreDraft: RestoreDraft | null = null;
	private flash: string | null = null;

	constructor(private readonly opts: SessionScreenOptions) {}

	async load(): Promise<void> {
		const data = await this.opts.caller.loadSession();
		this.session = data.session;
		this.checkpoints = data.checkpoints;
	}

	render(renderer: Renderer): void {
		renderer.writeln();
		renderer.writeln(c.bold("  AI Assist Session"));
		renderer.separator();
		if (!this.session) {
			renderer.writeln(c.dim("  No active session."));
			return;
		}
		const s = this.session;
		renderer.writeln(`  id:     ${s.id}`);
		renderer.writeln(`  status: ${s.status}${s.pausedReason ? `  (paused: ${s.pausedReason})` : ""}`);
		renderer.writeln(`  mode:   ${s.mode ?? "-"}`);
		renderer.writeln(`  model:  ${s.model ?? "-"}`);
		renderer.writeln(`  checkpoint: ${s.currentCheckpointId ?? "-"}`);
		renderer.writeln();
		renderer.writeln(c.bold("  Checkpoints"));
		if (this.checkpoints.length === 0) {
			renderer.writeln(c.dim("  (none)"));
		} else {
			for (const cp of this.checkpoints) {
				renderer.writeln(`  ${cp.id}  ${cp.kind}  turn=${cp.turnIndex}  ${cp.label}`);
			}
		}
		renderer.writeln();
		renderer.writeln(c.dim("  Space menu · :pause :resume :abort :checkpoint [label] :restore <id>"));
		if (this.menuOpen) this.renderMenu(renderer);
		if (this.abortDraft) this.renderAbortDraft(renderer);
		if (this.checkpointDraft) this.renderCheckpointDraft(renderer);
		if (this.restoreDraft) this.renderRestoreDraft(renderer);
		if (this.flash) {
			renderer.writeln();
			renderer.writeln(c.dim(`  ${this.flash}`));
		}
	}

	private renderMenu(renderer: Renderer): void {
		renderer.writeln();
		renderer.writeln(c.bold("  Menu"));
		const items: SessionMenuAction[] = ["pause", "resume", "abort", "checkpoint", "restore"];
		items.forEach((item, idx) => {
			const pointer = idx === this.menuCursor ? c.bold(">") : " ";
			renderer.writeln(`  ${pointer} ${labelFor(item)}`);
		});
	}

	private renderAbortDraft(renderer: Renderer): void {
		const draft = this.abortDraft!;
		renderer.writeln();
		renderer.writeln(c.bold("  Abort session"));
		const reasons = ABORT_REASONS.map((r, i) => {
			const pointer = i === draft.reasonIndex ? c.bold(">") : " ";
			return `  ${pointer} ${r}`;
		});
		renderer.writeln("  reason:");
		for (const r of reasons) renderer.writeln(r);
		renderer.writeln(`  note:   ${draft.note}`);
		renderer.writeln(c.dim(`  field=${draft.field}  Tab cycles, Enter confirms, note required`));
	}

	private renderCheckpointDraft(renderer: Renderer): void {
		renderer.writeln();
		renderer.writeln(c.bold("  Checkpoint"));
		renderer.writeln(`  label: ${this.checkpointDraft!.label}`);
		renderer.writeln(c.dim("  Enter confirms, leave blank for default"));
	}

	private renderRestoreDraft(renderer: Renderer): void {
		renderer.writeln();
		renderer.writeln(c.bold("  Restore checkpoint"));
		this.checkpoints.forEach((cp, idx) => {
			const pointer = idx === this.restoreDraft!.cursor ? c.bold(">") : " ";
			renderer.writeln(`  ${pointer} ${cp.id}  turn=${cp.turnIndex}  ${cp.label}`);
		});
		renderer.writeln(c.dim("  Enter restores, Esc cancels"));
	}

	openMenu(): void {
		this.menuOpen = true;
		this.menuCursor = 0;
	}

	closeMenu(): void {
		this.menuOpen = false;
	}

	private setFlash(message: string): void {
		this.flash = message;
	}

	async dispatchPalette(line: string): Promise<void> {
		const trimmed = line.trim();
		if (!trimmed.startsWith(":")) {
			throw new Error("palette commands must begin with ':'");
		}
		const tokens = trimmed.slice(1).split(/\s+/);
		const [verb, ...rest] = tokens;
		switch (verb) {
			case "pause":
				await this.opts.caller.pause(rest.length > 0 ? rest.join(" ") : null);
				this.setFlash("Session paused.");
				return;
			case "resume":
				await this.opts.caller.resume(rest[0] ?? null);
				this.setFlash("Session resumed.");
				return;
			case "abort":
				this.abortDraft = { reasonIndex: 0, note: rest.join(" ").trim(), field: rest.length > 0 ? "note" : "reason" };
				return;
			case "checkpoint":
				this.checkpointDraft = { label: rest.join(" ").trim() };
				return;
			case "restore":
				if (rest.length > 0 && rest[0]) {
					await this.opts.caller.restore(rest[0]);
					this.setFlash("Checkpoint restored.");
				} else {
					this.restoreDraft = { cursor: 0 };
				}
				return;
			default:
				throw new Error(`unknown palette command ':${verb}'`);
		}
	}

	async chooseMenuAction(): Promise<void> {
		const items: SessionMenuAction[] = ["pause", "resume", "abort", "checkpoint", "restore"];
		const action = items[this.menuCursor];
		this.menuOpen = false;
		if (!action) return;
		await this.dispatchPalette(`:${action}`);
	}

	cycleAbortField(): void {
		if (!this.abortDraft) return;
		this.abortDraft.field = this.abortDraft.field === "reason" ? "note" : "reason";
	}

	abortPickReason(direction: -1 | 1): void {
		if (!this.abortDraft) return;
		const next = this.abortDraft.reasonIndex + direction;
		const max = ABORT_REASONS.length - 1;
		this.abortDraft.reasonIndex = Math.max(0, Math.min(max, next));
	}

	abortAppendNote(text: string): void {
		if (!this.abortDraft) return;
		this.abortDraft.note += text;
	}

	abortBackspaceNote(): void {
		if (!this.abortDraft) return;
		this.abortDraft.note = this.abortDraft.note.slice(0, -1);
	}

	async confirmAbort(): Promise<void> {
		if (!this.abortDraft) throw new Error("no abort draft");
		if (this.abortDraft.note.trim().length === 0) {
			throw new Error("note is required");
		}
		await this.opts.caller.abort({
			reason: ABORT_REASONS[this.abortDraft.reasonIndex] as AbortReason,
			note: this.abortDraft.note,
		});
		this.abortDraft = null;
		this.setFlash("Session aborted.");
	}

	cancelAbort(): void {
		this.abortDraft = null;
	}

	checkpointAppendLabel(text: string): void {
		if (!this.checkpointDraft) return;
		this.checkpointDraft.label += text;
	}

	checkpointBackspace(): void {
		if (!this.checkpointDraft) return;
		this.checkpointDraft.label = this.checkpointDraft.label.slice(0, -1);
	}

	async confirmCheckpoint(): Promise<void> {
		if (!this.checkpointDraft) throw new Error("no checkpoint draft");
		const trimmed = this.checkpointDraft.label.trim();
		await this.opts.caller.checkpoint(trimmed.length > 0 ? trimmed : null);
		this.checkpointDraft = null;
		this.setFlash("Checkpoint saved.");
	}

	cancelCheckpoint(): void {
		this.checkpointDraft = null;
	}

	moveRestoreCursor(direction: -1 | 1): void {
		if (!this.restoreDraft) return;
		const next = this.restoreDraft.cursor + direction;
		const max = this.checkpoints.length - 1;
		this.restoreDraft.cursor = Math.max(0, Math.min(max, next));
	}

	async confirmRestore(): Promise<void> {
		if (!this.restoreDraft) throw new Error("no restore draft");
		const target = this.checkpoints[this.restoreDraft.cursor];
		if (!target) throw new Error("no checkpoint selected");
		await this.opts.caller.restore(target.id);
		this.restoreDraft = null;
		this.setFlash("Checkpoint restored.");
	}

	cancelRestore(): void {
		this.restoreDraft = null;
	}

	// Test helpers
	get currentAbortDraft(): AbortDraft | null {
		return this.abortDraft;
	}

	get currentCheckpointDraft(): CheckpointDraft | null {
		return this.checkpointDraft;
	}

	get currentRestoreDraft(): RestoreDraft | null {
		return this.restoreDraft;
	}

	get currentFlash(): string | null {
		return this.flash;
	}
}

function labelFor(action: SessionMenuAction): string {
	switch (action) {
		case "pause":
			return "Pause";
		case "resume":
			return "Resume";
		case "abort":
			return "Abort…";
		case "checkpoint":
			return "Checkpoint…";
		case "restore":
			return "Restore…";
		default:
			return "";
	}
}
