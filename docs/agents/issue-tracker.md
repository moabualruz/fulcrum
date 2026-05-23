# Issue tracker: local markdown

Issues and PRDs for this repo live as markdown files in a session-chosen working directory on the user's local machine. They are NOT tracked in git. The orchestrator (or the user) names a working root and tells the agent; the conventions below describe the file shape independent of where the root happens to be.

## Conventions

- One feature per directory: `<root>/<feature-slug>/`
- The PRD is `<root>/<feature-slug>/PRD.md`
- Implementation issues are `<root>/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `<root>/<feature-slug>/` (creating the directory if needed), using whatever working root the current session is using.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
