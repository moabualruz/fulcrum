---
name: create-plan
description: Generate structured implementation plan from PRD or issue.
---

# Create Plan

Implementation plan from PRD/issue:

1. Recall first: `fulcrum action exec recall_memory` with PRD/issue title as query.
2. Identify PRD/issue: `fulcrum action exec list_tasks` → parent issue/PRD ID.
3. Decompose into concrete, testable tasks. Each:
   - Completable by one agent in one session.
   - Clear done criterion.
   - References files/systems touched.
4. `fulcrum action exec create_task` for each, `assigned_to` = appropriate role.
5. `fulcrum action exec write_memory` (`kind: "summary"`) capturing plan rationale.
