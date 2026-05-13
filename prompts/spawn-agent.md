---
description: Start an agent session from agents/*.md config
argument-hint: "[user:|proj:|project:|both:]<agent-name> [task]"
---
If no agent name is provided, call `spawn_agent` without `agent` to list available agents.

You can optionally prefix the first argument with scope:
- `user:reviewer`
- `proj:reviewer` / `project:reviewer`
- `both:reviewer`

Otherwise call `spawn_agent` with:

- `agent`: "$1"
- `task`: "${@:2}" if any task text was provided
