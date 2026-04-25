import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AdapterMetadataSchema, type AdapterMetadata } from "@fulcrum/shared";
import type { AdapterConfigurationRepositoryPort } from "./registry.js";

interface AdapterConfigurationState {
  adapters: AdapterMetadata[];
}

export class FileAdapterConfigurationRepository implements AdapterConfigurationRepositoryPort {
  constructor(private readonly stateFile: string) {}

  save(metadata: AdapterMetadata): AdapterMetadata {
    const parsed = AdapterMetadataSchema.parse(metadata);
    const state = this.read();
    state.adapters = [
      parsed,
      ...state.adapters.filter((adapter) => adapter.adapterId !== parsed.adapterId)
    ];
    this.write(state);
    return parsed;
  }

  get(adapterId: string): AdapterMetadata | undefined {
    return this.read().adapters.find((adapter) => adapter.adapterId === adapterId);
  }

  list(): AdapterMetadata[] {
    return this.read().adapters.sort((left, right) =>
      left.adapterId.localeCompare(right.adapterId)
    );
  }

  private read(): AdapterConfigurationState {
    try {
      const data = JSON.parse(
        readFileSync(this.stateFile, "utf8")
      ) as Partial<AdapterConfigurationState>;
      return {
        adapters: (data.adapters ?? []).map((adapter) => AdapterMetadataSchema.parse(adapter))
      };
    } catch {
      return { adapters: [] };
    }
  }

  private write(state: AdapterConfigurationState): void {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}
