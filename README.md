# pi-zellij-tools

Pi package that adds a minimal Zellij tool for launching an independent, observable `pi` process in a new Zellij pane.

## What it adds

- `zellij_spawn_pi`: creates a new Zellij pane and runs interactive `pi` inside it.
- `/zellij-pane-minimal [task prompt]`: prompt template that asks Pi to create a pane with the minimal tool call and optionally pass a task prompt to the child Pi.
- The parent Pi does not wait for the child Pi to finish.
- The child Pi is directly visible and interactive in Zellij.
- If `prompt` is empty, the child Pi starts in plain interactive mode.
- If `prompt` is provided, the child Pi handles it first and then waits for follow-up input.
- `floating` and `direction` are mutually exclusive and cannot be used together.

## Requirements

- `zellij` available on `PATH`
- `pi` available on `PATH`
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

## Example prompt

```text
Use zellij_spawn_pi to create a right-side pane named pi-child and start a child pi that inspects the current project structure.
```

## Prompt templates

- `/zellij-pane-minimal [task prompt]`: create a new child Pi pane with default pane settings; if provided, `[task prompt]` is passed to the child Pi as its initial prompt.

## Minimal verification

Inside Zellij:

```bash
zellij action list-panes --json
zellij action new-pane --cwd "$PWD" -n pi-smoke -d right -- pi "Reply OK and wait for follow-up instructions."
```

After installing the package, ask Pi to use `zellij_spawn_pi`. Success means a new Zellij pane appears with an independent interactive Pi process.
