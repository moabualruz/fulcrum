import { readable, type Readable } from "svelte/store";
import {
  createFulcrumStore,
  type FulcrumState,
} from "@fulcrum/product-kernel/state/store.ts";
import type { StoreApi } from "zustand/vanilla";

const store: StoreApi<FulcrumState> = createFulcrumStore();

export const fulcrumState: Readable<FulcrumState> = readable(store.getState(), (set) => {
  return store.subscribe(set);
});

export function setActiveProject(id: string | null): void {
  store.getState().setActiveProject(id);
}

export function getStore(): StoreApi<FulcrumState> {
  return store;
}
