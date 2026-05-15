# pi-zellij-tools

Pi package that adds tools for running shell commands and independent Pi sessions in new terminal targets.

## What it adds

- `run_shell`: runs a shell command in a new terminal target.
- `spawn_pi`: creates a new terminal target and runs interactive `pi` inside it.
- `spawn_agent`: starts a preconfigured agent session from `agents/*.md` files.
- `handoff_agent`: starts a visible child agent with file-backed result handoff.
- `/run-shell [command]`: slash command to run a shell command.
- `/spawn-pi [task prompt]`: slash command to spawn a child Pi session.
- `/spawn-agent <agent-name> [task]`: slash command to start a configured agent.
- The parent Pi does not wait for the child process to finish.
- The child process is directly visible and interactive in the terminal.
- If `prompt` is empty, the child Pi starts in plain interactive mode.
- If `prompt` is provided, the child Pi handles it first and then waits for follow-up input.
- `floating` and `direction` are mutually exclusive and cannot be used together.

## Current backend

The current implementation uses Zellij as the terminal backend. The default target type is `pane`.

## Requirements

- `zellij` available on `PATH`
- `pi` available on `PATH` (for `spawn_pi` / `spawn_agent`)
- The parent `pi` process must already be running inside Zellij

## Installation

### NPM

```bash
pi install npm:pi-zellij-tools
```

### Git

```bash
pi install git:github.com/x1any/pi-zellij-tools
```

## Security / Trust Boundary

Installing this package grants Pi the ability to spawn arbitrary shell commands and independent Pi sessions in new Zellij panes. The `run_shell` tool can execute any shell command, and `spawn_pi`/`spawn_agent` can start new Pi instances with arbitrary prompts.

### Project-level agents

Project-level agents (from `.pi/agents/` in the repo) are treated as potentially untrusted:

- By default (`agentScope: "user"`), only user-level agents from `~/.pi/agent/agents/` are loaded.
- To use project-level agents, explicitly set `agentScope: "project"` or `"both"`.
- When a project-level agent is selected and `confirmProjectAgents` is `true` (default), a confirmation dialog is shown before launching.
- If no UI is available (e.g., RPC mode), project-level agents are rejected unless `confirmProjectAgents: false` is explicitly set.

### General

- Only install this package in projects and with AI models you trust.
- The `--` separator is used to prevent Zellij argument injection, but it does not limit the shell commands or Pi prompts themselves.
- Review generated commands before allowing execution if your client supports confirmation.

## Tools

### `run_shell`

Run a shell command in a new terminal target.

Parameters:
- `command` (required): shell command to execute
- `cwd`: working directory (defaults to current cwd)
- `name`: name for the terminal target (defaults to `shell-command`)
- `shell`: shell to use (defaults to `sh`)
- `target`: terminal target configuration

### `spawn_pi`

Start an independent pi session in a new terminal target.

Parameters:
- `prompt`: initial prompt passed to the child pi process
- `cwd`: working directory (defaults to current cwd)
- `name`: name for the terminal target (defaults to `pi-child`)
- `target`: terminal target configuration
- `model`: model pattern or ID passed to pi via `--model`
- `thinkingLevel`: thinking level passed to pi via `--thinking`

### `spawn_agent`

Start a preconfigured agent session from `agents/*.md` files in a new terminal target.

Parameters:
- `agent`: agent name from `agents/*.md`. Omit to list available agents. Supports optional scope prefix: `user:<name>`, `project:<name>`, `proj:<name>`, `both:<name>`.
- `task`: initial task prompt for the agent.
- `agentScope`: which agent directories to use: `"user"` (default), `"project"`, or `"both"`. If `agent` uses a scope prefix, that prefix takes precedence.
- `confirmProjectAgents`: whether to confirm before using project-level agents (default: `true`).
- `cwd`: working directory (defaults to current cwd)
- `name`: name for the terminal target (defaults to `agent-<agent-name>`)
- `target`: terminal target configuration

### `handoff_agent`

Start a visible child agent and collect a structured result from `.pi/agent-runs/<runId>/`.

Parameters:
- `agent` (required): agent name from `agents/*.md`
- `task` (required): delegated task
- `context`: filtered relevant context for child
- `agentScope`: `"user"` (default), `"project"`, or `"both"`
- `confirmProjectAgents`: confirm project-level agent usage (default: `true`)
- `cwd`, `name`, `target`: same meaning as other spawn tools
- `wait`: wait for completion (default: `true`)
- `timeoutMs`: wait timeout (default: `600000`)
- `pollIntervalMs`: polling interval (default: `2000`)

Run protocol directory:

```text
.pi/agent-runs/<runId>/
  manifest.json
  task.md
  context.md
  instructions.md
  status.json
  result.md
  inbox.md
  notes.md
  artifacts/
```

Timeout behavior:

- `timeoutMs` only controls how long the parent waits for `status.json`.
- A timeout does not stop or close the child pane.
- If timeout happens, inspect `.pi/agent-runs/<runId>/status.json` and `result.md`.
- Child panes are named `handoff-<agent>` by default, or by the provided `name`.
- Close stale panes manually from Zellij if no longer needed.

Tool returns run metadata and latest status.

### Target configuration

All tools accept an optional `target` parameter:

```ts
{
  type?: "pane";       // Currently only "pane" is supported
  direction?: "right" | "down";
  floating?: boolean;
}
```

## Slash commands

- `/run-shell [command]`: run a shell command in a new terminal target.
- `/spawn-pi [task prompt]`: create a new child Pi pane with default settings.
- `/spawn-agent <agent-name> [task]`: start a configured agent session.

## Agent configuration

Agents are defined as Markdown files with YAML frontmatter in an `agents/` directory.

### Paths

- **User level**: `~/.pi/agent/agents/*.md` — always available.
- **Project level**: `<project>/.pi/agents/*.md` — discovered by searching upward from `cwd`.

### File format

```markdown
---
name: reviewer
description: Code review specialist
model: claude-sonnet-4-20250514
thinkingLevel: high
tools: read,bash,grep,find,ls
---

You are a code review specialist. Focus on:

- Code quality and best practices
- Security vulnerabilities
- Performance issues
```

`tools` can also be a YAML array:

```yaml
tools:
  - read
  - grep
  - find
  - ls
```

### Frontmatter fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Agent name, used for matching. Letters, digits, `-`, `_`, `.` |
| `description` | Yes | Description, shown in agent list |
| `model` | No | Passed to `pi --model` |
| `thinkingLevel` | No | Passed to `pi --thinking`. One of: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `tools` | No | Passed to `pi --tools`. Comma string or YAML array |

The Markdown body (after frontmatter) is used as the agent's system prompt.

### Example

Create `~/.pi/agent/agents/reviewer.md`:

```markdown
---
name: reviewer
description: Review code in read-only mode
model: claude-sonnet-4-20250514
thinkingLevel: high
tools: read,grep,find,ls
---

You are a reviewer. Do not edit files. Review for bugs and risks.
```

Then ask: "Use spawn_agent to start reviewer for the current diff."

## Minimal verification

Inside Zellij:

```bash
zellij action list-panes --json
zellij action new-pane --cwd "$PWD" -n pi-smoke -d right -- pi "Reply OK and wait for follow-up instructions."
```

After installing the package, ask Pi to use `run_shell`, `spawn_pi`, or `spawn_agent`. Success means a new Zellij pane appears with the command running.
