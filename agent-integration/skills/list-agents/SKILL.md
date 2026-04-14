---
name: list-agents
description: Discover available agent roles and their capabilities before assigning work
triggers:
  - choosing which agent to assign a task to
  - exploring available roles
  - checking agent definitions
---

# List Agents

To discover available agent roles:

1. Call `mcp__fulcrum__list_agent_profiles` to see all 24 canonical roles with their descriptions and capabilities.
2. Key roles to know:
   - `chief_of_staff` (L1): orchestrates teams, creates tasks — never writes code
   - `software_engineer`: general implementation
   - `qa_engineer`: testing and verification
   - `code_reviewer`: code review and quality
   - `architecture_reviewer`: system design review
   - `research_worker`: investigation and analysis
   - `memory_curator`: memory maintenance and consolidation
3. For custom roles, check `mcp__fulcrum__list_agent_profiles` for any workspace-specific definitions.
4. Assign tasks to roles based on the task's `done criteria` — match the skill required to the role's description.
