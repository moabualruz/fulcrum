/**
 * Global selection store: tracks selected task IDs across the app.
 * Used by CommandPalette to conditionally show Bulk Action commands.
 */

import { writable } from "svelte/store";

/** IDs of currently selected tasks (for bulk operations). */
export const selectedTaskIds = writable<string[]>([]);
