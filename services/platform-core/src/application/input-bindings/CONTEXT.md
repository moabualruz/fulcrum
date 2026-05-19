# Input Bindings

Shared registry of keyboard-driven actions for the Fulcrum web, CLI, and TUI surfaces, with platform-aware defaults and per-tenant overrides resolved from `TenantSetting` rows under the `keybinding.<action>` key.

## Language

**KeybindingAction**:
A stable identifier for a user-invocable command (`navigate.tasks`, `palette.open`, `run.dispatch`) drawn from the closed `KEYBINDING_ACTIONS` enum.
_Avoid_: command, hotkey id, intent, verb

**KeybindingContext**:
The scope a binding is active in (`global | navigation | task | doc | sprint | run | view`); duplicate keys are allowed across contexts but not within one.
_Avoid_: mode, scope, layer, focus group

**Shortcut**:
A `ShortcutSchema`-validated string of optional `Ctrl|Alt|Shift|Meta|⌘` modifiers plus one key token (letter, digit, punctuation, or named key like `Esc`/`ArrowUp`).
_Avoid_: hotkey, chord, key combo, accelerator

**Keybinding**:
The `{ context, key }` pair attached to one `KeybindingAction`.
_Avoid_: shortcut entry, mapping

**KeybindingMap**:
A `Record<KeybindingAction, Keybinding>` covering every action in the registry exactly once.
_Avoid_: shortcut table, keymap, bindings object

**KeybindingPlatform**:
The OS token (`darwin | linux | win32`) that picks the primary modifier — `⌘` on darwin, `Ctrl` elsewhere.
_Avoid_: os, host, runtime

**KeybindingConflict**:
A `{ context, key, actions[] }` record emitted by `detectConflicts` when two or more actions share the same context+key.
_Avoid_: clash, duplicate, collision

**TenantSettingsReader**:
The minimal `{ get(key) }` port used by `resolveKeybindings` to read `keybinding.<action>` overrides from a `TenantSetting` source without depending on its repository.
_Avoid_: settings client, config reader, preferences store

## Relationships

- A **KeybindingAction** has exactly one default **Keybinding** per **KeybindingPlatform**, produced by `getDefaultKeybindings`.
- A **KeybindingMap** contains one **Keybinding** for every **KeybindingAction**; missing or extra keys fail `KeybindingMapSchema`.
- A **TenantSettingsReader** override at `keybinding.<action>` replaces only the `key` of that action's **Keybinding**; the **KeybindingContext** is fixed by the registry.
- Invalid override **Shortcut** strings are ignored and the default **Keybinding** is kept.
- `detectConflicts` groups **Keybindings** by `(context, key)` and returns one **KeybindingConflict** per duplicated bucket.
- The web, CLI, and TUI surfaces all consume the same **KeybindingMap** through `resolveKeybindings`; `default-web.ts` only narrows a small `Partial<KeybindingMap>` for the web shell.

## Example dialogue

> **Dev:** "If I want `palette.open` to be `Ctrl+P` for one org, where does that live?"
> **Domain expert:** "Write a **TenantSetting** with key `keybinding.palette.open` and value `Ctrl+P`. `resolveKeybindings` reads it through a **TenantSettingsReader**, validates against `ShortcutSchema`, and swaps only the `key` of that **Keybinding** — the **KeybindingContext** stays `global`."
> **Dev:** "And if two actions end up on the same chord?"
> **Domain expert:** "`detectConflicts` returns a **KeybindingConflict** per `(context, key)` bucket. Same key in different **KeybindingContexts** is fine."

## Flagged ambiguities

- "shortcut" was used for both the raw string and the bound action — resolved: the string is a **Shortcut**, the `{ context, key }` pair is a **Keybinding**, and the action identifier is a **KeybindingAction**.
- "global" overlapped **KeybindingContext** `global` and platform-wide defaults — resolved: `global` is only the context label; cross-platform defaults are produced by `getDefaultKeybindings`, not by the `global` context.
