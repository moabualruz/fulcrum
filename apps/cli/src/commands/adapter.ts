import {
  buildAdapterDegradationSummary,
  certifyAdapters,
  type AdapterRegistryService
} from "@fulcrum/core";

export async function listAdaptersCommand(registry: AdapterRegistryService) {
  return registry.listHealth();
}

export async function enableAdapterCommand(registry: AdapterRegistryService, adapterId: string) {
  return registry.enable(adapterId);
}

export async function disableAdapterCommand(
  registry: AdapterRegistryService,
  adapterId: string,
  reason: string
) {
  return registry.disable(adapterId, reason);
}

export async function adapterDegradationCommand(registry: AdapterRegistryService) {
  return buildAdapterDegradationSummary(registry);
}

export async function certifyAdaptersCommand(registry: AdapterRegistryService) {
  return certifyAdapters(registry);
}
