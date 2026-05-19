# Skill Supply

Application-layer mechanics for loading, syncing, conflict-resolving, and publishing **FulcrumSkill** rows: agent install dirs, the on-disk lock file, upstream git mirroring, the signed marketplace, and MCP virtual-skill descriptors. Parent vocabulary (**FulcrumSkill**, **SkillVersion**, **SkillConflict**) is defined in `services/platform-core/CONTEXT.md`.

## Language

**AgentInstallDir**:
A per-agent on-disk skills root (e.g. `~/.claude/skills`, `~/.codex/skills`) where SKILL.md files are mirrored.
_Avoid_: skill folder, install path, plugin dir

**SkillsLockFile**:
The `skills.lock.json` map of `slug -> { version, hash, installedAt, enabled_agents, upstream_conflict? }` recording installed state.
_Avoid_: skills manifest, pin file, registry file

**SkillsLockEntry**:
One row in the **SkillsLockFile** for a single skill slug.
_Avoid_: lock row, pin entry

**SkillsLock**:
The filesystem mutex (a directory at `<lockFile>.lock`) held while mutating the **SkillsLockFile** or **AgentInstallDir** contents.
_Avoid_: install mutex, file lock

**SkillSource (loader)**:
An on-disk SKILL.md authored under `skills/<slug>/`, the input artifact that produces an installed **FulcrumSkill**.
_Avoid_: source skill, master skill

**UpstreamSync**:
A run that shallow-clones each upstream-sourced **FulcrumSkill**, compares to local content, and either fast-forwards or records a **SkillConflict**.
_Avoid_: skill pull, refresh, update

**SyncResult**:
The `{ merged, conflicts, errors }` tally returned by an **UpstreamSync** run.
_Avoid_: sync report, outcome

**ConflictResolution**:
A user-chosen outcome `local | upstream | editor` applied to an open **SkillConflict**.
_Avoid_: merge strategy, resolution mode

**MarketplaceListing**:
A signed `{ slug, version, manifest_json, signature, publisher_org_id }` row served by the marketplace registry; signature is Ed25519 over `manifest_json + slug + version`.
_Avoid_: published skill, registry entry, package

**OrgMarketplaceKey**:
The org's Ed25519 publisher key pair — public key row in `org_marketplace_keys`, private key file at `<keyringDir>/<orgId>.key`.
_Avoid_: signing key, publisher cert

**McpVirtualSkill**:
A `source=mcp`, `invokableByFulcrum=false` descriptor synthesized from a built-in MCP server (server name, command/url, vendor, tool names, descriptor + tool-manifest SHA-256).
_Avoid_: mcp skill, virtual server, mcp shim

**SkillRegistryEntry**:
A merged listing row `{ slug, name, source: local | upstream | mcp, version, enabledAgents }` returned by `SkillRegistryService.list` across all sources.
_Avoid_: skill view, merged row

## Relationships

- A **FulcrumSkill** has one **SkillsLockEntry** in the **SkillsLockFile** and is mirrored into one **AgentInstallDir** per `enabledAgents` entry.
- A **SkillsLock** is held for the duration of any install, uninstall, or **UpstreamSync** write.
- An **UpstreamSync** over `source=upstream` **FulcrumSkill** rows produces a **SyncResult**; a non-clean local file becomes a **SkillConflict** plus `upstream_conflict` blob on the **SkillsLockEntry**.
- A **ConflictResolution** closes one **SkillConflict** and rewrites the matching **SkillsLockEntry** and **AgentInstallDir** copies.
- A **MarketplaceListing** is signed by an **OrgMarketplaceKey**; verification fetches the publisher's active (non-revoked) public key row.
- An **McpVirtualSkill** is built from `BUILTIN_MCPS`, has no **SkillsLockEntry** and no **AgentInstallDir** mirror.
- A **SkillRegistryEntry** projects a **FulcrumSkill** (local/upstream) or an **McpVirtualSkill** into one unified shape.

## Example dialogue

> **Dev:** "On `fulcrum skills sync`, what guards the **SkillsLockFile** when two processes race?"
> **Domain expert:** "The **SkillsLock** directory next to the lock file. Stale-lock cleanup checks `lock.json` pid + mtime; only the holder writes **SkillsLockEntry** rows or touches an **AgentInstallDir**."
> **Dev:** "And if the upstream SKILL.md differs from local?"
> **Domain expert:** "An **UpstreamSync** records a **SkillConflict** with kind `upstream_conflict`, stamps the diff into the **SkillsLockEntry**, and waits for a **ConflictResolution**. Nothing in the **AgentInstallDir** changes until the user picks `local`, `upstream`, or `editor`."

## Flagged ambiguities

- "source" overlapped the on-disk **SkillSource (loader)** SKILL.md and the **FulcrumSkill** `source` discriminator (`local | upstream | package | mcp`) — resolved: the discriminator is the registry field; the on-disk artifact is the loader input.
- "lock" overlapped the **SkillsLockFile** (persisted JSON) and the **SkillsLock** (filesystem mutex) — resolved: they are distinct; the mutex protects writes to the file.
- "publish" overlapped writing a SKILL.md and signing a **MarketplaceListing** — resolved: publishing means the signed registry POST, never the local install.
