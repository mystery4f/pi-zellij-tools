# pi-zellij-tools

Pi package that adds tools for running shell commands and independent Pi sessions in new terminal targets.

## What it adds

- `run_shell`: runs a shell command in a new terminal target.
- `spawn_pi`: creates a new terminal target and runs interactive `pi` inside it.
- `/run-shell [command]`: slash command to run a shell command.
- `/spawn-pi [task prompt]`: slash command to spawn a child Pi session.
- The parent Pi does not wait for the child process to finish.
- The child process is directly visible and interactive in the terminal.
- If `prompt` is empty, the child Pi starts in plain interactive mode.
- If `prompt` is provided, the child Pi handles it first and then waits for follow-up input.
- `floating` and `direction` are mutually exclusive and cannot be used together.

## Current backend

The current implementation uses Zellij as the terminal backend. The default target type is `pane`.

## Requirements

- `zellij` available on `PATH`
- `pi` available on `PATH` (for `spawn_pi`)
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

Installing this package grants Pi the ability to spawn arbitrary shell commands and independent Pi sessions in new Zellij panes. The `run_shell` tool can execute any shell command, and `spawn_pi` can start new Pi instances with arbitrary prompts.

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

### Target configuration

Both tools accept an optional `target` parameter:

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

## Minimal verification

Inside Zellij:

```bash
zellij action list-panes --json
zellij action new-pane --cwd "$PWD" -n pi-smoke -d right -- pi "Reply OK and wait for follow-up instructions."
```

After installing the package, ask Pi to use `run_shell` or `spawn_pi`. Success means a new Zellij pane appears with the command running.
