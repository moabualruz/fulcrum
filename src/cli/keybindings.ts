import {
  KEYBINDING_ACTIONS,
  resolveKeybindings,
  type KeybindingPlatform,
  type TenantSettingsReader,
} from "../keybindings/index.ts";

export async function renderKeybindingHelp(options: {
  platform?: KeybindingPlatform;
  settings?: TenantSettingsReader;
} = {}): Promise<string> {
  const bindings = await resolveKeybindings(options);
  const lines = ["Keyboard shortcuts:"];

  for (const action of KEYBINDING_ACTIONS) {
    const binding = bindings[action];
    lines.push(`  ${action.padEnd(28)} ${binding.key}`);
  }

  return lines.join("\n");
}
