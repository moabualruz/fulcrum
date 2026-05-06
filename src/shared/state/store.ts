import { createStore, type StoreApi } from "zustand/vanilla";

export interface FulcrumState {
  activeProjectId: string | null;
  setActiveProject(id: string | null): void;
}

export function createFulcrumStore(): StoreApi<FulcrumState> {
  return createStore<FulcrumState>()((set) => ({
    activeProjectId: null,
    setActiveProject: (id) => set({ activeProjectId: id }),
  }));
}
