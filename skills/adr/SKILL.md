---
name: adr
description: Capture an architectural decision as a Vibe ADR — short markdown file in docs/decisions/, globally numbered (G-NNNN), registered in vault/cross-project/adr-registry.md. Triggered by /adr <one-line>, or proposed at /wrap when the agent detects a missed decision in the transcript. Never write autonomously — always confirm with the user.
---

# Vibe ADR

## When to use

- The user invokes `/adr <one-line summary>`.
- During `/wrap`, you reviewed the session transcript and identified a clear architectural decision that was discussed and chosen but no ADR exists yet.

**Never write autonomously.** Always present the draft and require explicit user confirmation before committing.

## Workflow

1. **Claim the next G-NNNN.**
   - Read `~/vault/cross-project/adr-registry.md`.
   - Find the highest existing `G-` number; claim `G-(max+1)`, zero-padded to 4 digits.
   - If the registry is missing or empty, start at `G-0001`.

2. **Generate the ADR draft.**
   - Slug: lowercase-hyphenated short name from the one-line summary.
   - Filename: `docs/decisions/G-NNNN-<slug>.md`.
   - Body format:
     ```markdown
     # docs/decisions/G-NNNN-<slug>.md

     ## Context
     <1 sentence — why this decision was needed>

     ## Decision
     <1 sentence — what was chosen>

     ## Consequences
     - <consequence 1>
     - <consequence 2>
     - <consequence 3 if applicable>
     ```

3. **Show the draft to the user.** Wait for explicit confirmation. Accept edits before write.

4. **On confirmation, write both files atomically.**
   - Write `docs/decisions/G-NNNN-<slug>.md`.
   - Append a row to `~/vault/cross-project/adr-registry.md`:
     ```
     | G-NNNN | YYYY-MM-DD | <project> | <one-line topic> | Proposed | <project>/docs/decisions/G-NNNN-<slug>.md |
     ```
   - `<project>` is `basename "$PWD"`.

5. **Commit.**
   - In the project repo: `git add docs/decisions/G-NNNN-<slug>.md && git commit -m "docs(adr): G-NNNN <topic>"`.
   - In the vault: `git -C ~/vault add cross-project/adr-registry.md && git -C ~/vault commit -m "adr-registry: claim G-NNNN [<project>]"`.
   - Vault push happens at session-stop.sh, but you may push immediately if the user prefers: `git -C ~/vault push`.

## Concurrent-claim race

If `git push` on the vault is rejected (another machine claimed the same number first):
1. `git -C ~/vault pull --rebase`.
2. Recompute `max(N)+1` from the rebased registry.
3. Rename the ADR file in the project repo to the new number.
4. Update the registry row to match.
5. Recommit and retry the push.

Solo-dev cross-machine usage means this race is rare; no lock file needed.

## Status values

`Proposed` · `Accepted` · `Superseded` · `Deprecated`. Update in place when status changes (edit both the ADR file and the registry row).

## Discovery

- All ADRs for a project: `rg "<project>" ~/vault/cross-project/adr-registry.md`.
- Resolve a reference: `rg "G-NNNN" ~/vault/cross-project/adr-registry.md`.
