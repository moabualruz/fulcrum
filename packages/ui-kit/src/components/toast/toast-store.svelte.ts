import type { AlertTone } from "../alert/alert.svelte";

export type ToastTone = AlertTone;

export interface ToastItem {
	id: string;
	tone: ToastTone;
	title?: string;
	description?: string;
	durationMs?: number;
	createdAt: number;
}

export type ToastInput = Omit<ToastItem, "id" | "createdAt"> & { id?: string };

let idSeq = 0;

function nextId(): string {
	idSeq += 1;
	return `toast-${idSeq}-${Date.now()}`;
}

export class ToastStore {
	items = $state<ToastItem[]>([]);
	#timers = new Map<string, ReturnType<typeof setTimeout>>();

	publish(input: ToastInput): ToastItem {
		const item: ToastItem = {
			id: input.id ?? nextId(),
			tone: input.tone,
			title: input.title,
			description: input.description,
			durationMs: input.durationMs ?? 5000,
			createdAt: Date.now(),
		};
		this.items.push(item);
		if (item.durationMs && item.durationMs > 0 && typeof setTimeout !== "undefined") {
			const handle = setTimeout(() => this.dismiss(item.id), item.durationMs);
			this.#timers.set(item.id, handle);
		}
		return item;
	}

	dismiss(id: string): void {
		const handle = this.#timers.get(id);
		if (handle) {
			clearTimeout(handle);
			this.#timers.delete(id);
		}
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear(): void {
		for (const handle of this.#timers.values()) {
			clearTimeout(handle);
		}
		this.#timers.clear();
		this.items = [];
	}
}

export const defaultToastStore = new ToastStore();
