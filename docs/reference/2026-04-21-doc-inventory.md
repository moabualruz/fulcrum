---
title: "Docs inventory"
type: reference
date: 2026-04-21
origin: "Generated from find docs -type f | sort"
---

# Docs Inventory

Canonical order here means lexicographic path order under `docs/`.

## Counts

| Section | Files |
|---|---:|
| README.md | 1 |
| architecture | 2 |
| audit | 26 |
| brainstorms | 13 |
| decisions | 6 |
| guides | 17 |
| handover | 7 |
| history | 5 |
| ideation | 5 |
| plans | 25 |
| reference | 13 |
| research | 7 |
| specs | 2 |
| superpowers | 17 |
| Total | 146 |

## Files

1. `docs/README.md`
2. `docs/architecture/install-paths.md`
3. `docs/architecture/memory-v3.md`
4. `docs/audit/AUDIT-2026-04-15.md`
5. `docs/audit/AUDIT-ROUND2.md`
6. `docs/audit/AUDIT-ROUND3.md`
7. `docs/audit/REMEDIATION-PLAN.md`
8. `docs/audit/codebase/c1-inventory.md`
9. `docs/audit/codebase/c2-user-surfaces.md`
10. `docs/audit/findings/f0-cross-cutting.md`
11. `docs/audit/findings/f1-mcp.md`
12. `docs/audit/findings/f2-plugin-integrations.md`
13. `docs/audit/findings/f3-skills.md`
14. `docs/audit/findings/f4-agent-definitions.md`
15. `docs/audit/findings/f5-rag-memory.md`
16. `docs/audit/findings/f6-modular-architecture.md`
17. `docs/audit/plans/p0-cross-cutting.md`
18. `docs/audit/plans/p1-mcp-server.md`
19. `docs/audit/plans/p2-plugin-integrations.md`
20. `docs/audit/plans/p3-skills.md`
21. `docs/audit/plans/p4-agent-definitions.md`
22. `docs/audit/plans/p5-memory-rag.md`
23. `docs/audit/plans/p6-modular-architecture.md`
24. `docs/audit/research/r1-mcp-standards.md`
25. `docs/audit/research/r2-plugin-systems.md`
26. `docs/audit/research/r3-skills.md`
27. `docs/audit/research/r4-agent-definitions.md`
28. `docs/audit/research/r5-rag-memory.md`
29. `docs/audit/research/r6-modular-architecture.md`
30. `docs/brainstorms/2026-04-15-fulcrum-ux-requirements.md`
31. `docs/brainstorms/2026-04-16-install-tui-dashboard-requirements.md`
32. `docs/brainstorms/2026-04-16-memory-architecture-v2/00-scope-split.md`
33. `docs/brainstorms/2026-04-16-memory-architecture-v2/01-problem-and-philosophy.md`
34. `docs/brainstorms/2026-04-16-memory-architecture-v2/02-activation-and-inventory.md`
35. `docs/brainstorms/2026-04-16-memory-architecture-v2/03-write-and-recall-paths.md`
36. `docs/brainstorms/2026-04-16-memory-architecture-v2/04-data-model.md`
37. `docs/brainstorms/2026-04-16-memory-architecture-v2/05-safety-watcher-wal.md`
38. `docs/brainstorms/2026-04-16-memory-architecture-v2/06-hooks-dreaming-operations.md`
39. `docs/brainstorms/2026-04-16-memory-architecture-v2/07-acceptance-and-planning.md`
40. `docs/brainstorms/2026-04-16-memory-architecture-v2/08-per-host-plugin-integration.md`
41. `docs/brainstorms/2026-04-16-memory-architecture-v2/index.md`
42. `docs/brainstorms/2026-04-16-plugin-install-operator-surfaces-requirements.md`
43. `docs/decisions/2026-04-16-copilot-request.md`
44. `docs/decisions/2026-04-16-dreaming-thresholds.md`
45. `docs/decisions/2026-04-16-fulcrum-eval-design.md`
46. `docs/decisions/2026-04-16-identity-decision.md`
47. `docs/decisions/2026-04-16-pr-1-bootstrap-entry.json`
48. `docs/decisions/2026-04-16-v2a-bake-mode.md`
49. `docs/guides/agent-roles.md`
50. `docs/guides/architecture.md`
51. `docs/guides/cli-reference.md`
52. `docs/guides/configuration.md`
53. `docs/guides/core-api.md`
54. `docs/guides/installation.md`
55. `docs/guides/mcp-tools.md`
56. `docs/guides/memory.md`
57. `docs/guides/monitor.md`
58. `docs/guides/plugins-and-extensions.md`
59. `docs/guides/policy.md`
60. `docs/guides/skill-authoring.md`
61. `docs/guides/sync.md`
62. `docs/guides/telemetry.md`
63. `docs/guides/worker-adapters.md`
64. `docs/guides/workflow-authoring.md`
65. `docs/guides/worktrees.md`
66. `docs/handover/2026-04-16-memory-v2-execution-handover.md`
67. `docs/handover/2026-04-16-memory-v2-execution-pickup-prompt.md`
68. `docs/handover/2026-04-16-memory-v2-pickup-prompt.md`
69. `docs/handover/2026-04-16-memory-v2-split-handover.md`
70. `docs/handover/2026-04-19-agent-parity-handover.md`
71. `docs/handover/memory-automation-via-hooks.md`
72. `docs/handover/memory-v2-execution-progress.md`
73. `docs/history/phase-1-raw-findings.md`
74. `docs/history/phase-1-validated.md`
75. `docs/history/phase-2-validated.md`
76. `docs/history/phase-3-validated.md`
77. `docs/history/phase-4-validated.md`
78. `docs/ideation/2026-04-15-cli-mcp-parity-ideation.md`
79. `docs/ideation/2026-04-15-fulcrum-ux-ideation.md`
80. `docs/ideation/2026-04-16-install-tui-dashboard-ideation.md`
81. `docs/ideation/2026-04-16-memory-automation-hooks-ideation.md`
82. `docs/ideation/2026-04-16-plugin-install-operator-surfaces-ideation.md`
83. `docs/plans/2026-04-15-001-feat-fulcrum-install-to-value-plan.md`
84. `docs/plans/2026-04-15-002-fix-monitor-reliability-and-test-gaps-plan.md`
85. `docs/plans/2026-04-16-001-feat-install-tui-dashboard-plan.md`
86. `docs/plans/2026-04-16-cli-first-action-platform-plan.md`
87. `docs/plans/2026-04-16-memory-v2-cross-plan-review.md`
88. `docs/plans/2026-04-16-memory-v2a-plan-review.md`
89. `docs/plans/2026-04-16-memory-v2a-plan.md`
90. `docs/plans/2026-04-16-memory-v2b-plan-review.md`
91. `docs/plans/2026-04-16-memory-v2b-plan.md`
92. `docs/plans/2026-04-16-plugin-install-operator-surfaces-plan.md`
93. `docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md`
94. `docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`
95. `docs/plans/2026-04-18-002-memory-tiered-architecture-progress.md`
96. `docs/plans/2026-04-18-002-memory-tiered-architecture-prompt.md`
97. `docs/plans/2026-04-18-003-worktrees-v2-plan.md`
98. `docs/plans/2026-04-19-004-agent-parity-plan.md`
99. `docs/plans/2026-04-19-004-agent-parity-progress.md`
100. `docs/plans/2026-04-19-004-agent-parity-prompt.md`
101. `docs/plans/2026-04-21-001-project-alignment-and-gap-workflow.md`
102. `docs/plans/MASTER-PLAN.md`
103. `docs/plans/plan-architecture.md`
104. `docs/plans/plan-mcp.md`
105. `docs/plans/plan-plugins.md`
106. `docs/plans/plan-rag.md`
107. `docs/plans/plan-skills-agents.md`
108. `docs/reference/2026-04-19-claude-code-extension-surface.md`
109. `docs/reference/2026-04-19-codex-cli-extension-surface.md`
110. `docs/reference/2026-04-19-copilot-extension-surface.md`
111. `docs/reference/2026-04-19-cursor-extension-surface.md`
112. `docs/reference/2026-04-19-fulcrum-skill-inventory.md`
113. `docs/reference/2026-04-19-gemini-cli-extension-surface.md`
114. `docs/reference/2026-04-19-opencode-extension-surface.md`
115. `docs/reference/2026-04-19-pi-cockpit-extension-surface.md`
116. `docs/reference/2026-04-19-windsurf-extension-surface.md`
117. `docs/reference/2026-04-20-integration-completeness-checklist.md`
118. `docs/reference/2026-04-21-doc-inventory.md`
119. `docs/reference/2026-04-21-fifth-pass-subagent-orchestration-audit.md`
120. `docs/reference/2026-04-21-fourth-pass-implementation-drift-audit.md`
121. `docs/research/agent-definitions.md`
122. `docs/research/cli-plugins.md`
123. `docs/research/mcp-standards.md`
124. `docs/research/modular-architecture.md`
125. `docs/research/plugin-standards-per-agent-host.md`
126. `docs/research/rag-embeddings.md`
127. `docs/research/skills-files.md`
128. `docs/specs/2026-04-15-cli-mcp-parity.md`
129. `docs/specs/2026-04-16-cli-first-action-platform.md`
130. `docs/superpowers/plans/2026-04-13-core-extension.md`
131. `docs/superpowers/plans/2026-04-13-memory.md`
132. `docs/superpowers/plans/2026-04-13-monitor.md`
133. `docs/superpowers/plans/2026-04-13-planning.md`
134. `docs/superpowers/plans/2026-04-13-policy.md`
135. `docs/superpowers/plans/2026-04-13-sync.md`
136. `docs/superpowers/plans/2026-04-13-teams.md`
137. `docs/superpowers/plans/2026-04-13-workflows.md`
138. `docs/superpowers/plans/2026-04-13-worktrees.md`
139. `docs/superpowers/plans/2026-04-14-fulcrum-round7.md`
140. `docs/superpowers/plans/2026-04-14-memory-stack-l0-l2.md`
141. `docs/superpowers/plans/2026-04-14-round-1-gap-fixes.md`
142. `docs/superpowers/plans/2026-04-14-round-2-gap-fixes.md`
143. `docs/superpowers/plans/2026-04-14-round-5-big-rocks.md`
144. `docs/superpowers/plans/2026-04-15-fulcrum-round8.md`
145. `docs/superpowers/specs/2026-04-13-fulcrum-full-rebuild-design.md`
146. `docs/superpowers/specs/2026-04-14-memory-graph-l0-design.md`
