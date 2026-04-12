# PI Agent Definition Templates

This directory contains template agent definition files for each role in the
PI Agent OS. These files use YAML frontmatter that PI reads to configure the
agent's model, system prompt, tools, and runtime behaviour.

## Usage

Copy these files to `.pi/agents/` in your project root and customise the
system prompts and tool lists for your specific codebase and requirements.

```bash
mkdir -p .pi/agents
cp src/pi_agent_os/pi_agents/*.md .pi/agents/
```

Then edit the system prompts in each file to match your project conventions.

## File naming

The filename (without `.md`) is the profile ID used in `PIAgentConfig.profile_id`
and returned by `PIRuntimeAdapter.list_profiles()`.

## Role to profile mapping

Roles are mapped to PI profiles via `routing/roles.py` and the
`agent-home/config/role_mappings.yaml` configuration file.
See `PI_INTEGRATION.md` for full details.
