import {
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "@platform-core/application/input-bindings/index.ts";

export async function createTuiKeybindingMap(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}) {
  return resolveKeybindings(options);
}
