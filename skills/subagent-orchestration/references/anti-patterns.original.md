## Anti-patterns

- Spawn subagents because many are available, not because units are independent.
- Give subagent broad context dump instead of focused steering.
- Ask subagent to "look around" without deliverable, ownership, and verification evidence.
- Spawn test agent for one obvious test.
- Spawn review agent for one tiny low-risk local change.
- Dispatch implementation before tests or verification criteria exist for behavior work.
- Let implementation agent modify tests unless explicitly assigned.
- Give two agents same write set.
- Wait immediately for subagent while parent has useful non-overlapping work.
- Trust final report without checking files/artifacts/logs/config paths.
- Treat `git status` and `git diff --stat` as complete truth; generated files, installed config, logs, and claimed paths also matter.
- Mark done because agent said done.
- Let code, docs, examples, tests, evals, or generated artifacts drift after behavior changes.
- Create new docs when existing docs have correct home.
- Invent project-specific steering filenames as universal requirements.
