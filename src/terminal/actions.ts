import type { TerminalBackend, TerminalTarget, OpenCommandResult } from "./types.js";
import type { AgentConfig } from "../agents/discovery.js";

const DEFAULT_TARGET: TerminalTarget = { type: "pane" };

export interface RunShellOptions {
  command: string;
  cwd?: string;
  name?: string;
  shell?: string;
  target?: TerminalTarget;
}

export async function runShell(
  backend: TerminalBackend,
  options: RunShellOptions,
  signal?: AbortSignal,
): Promise<OpenCommandResult & { cwd: string; name: string }> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? "shell-command";
  const shell = options.shell ?? "sh";
  const target = options.target ?? DEFAULT_TARGET;

  const result = await backend.openCommand(
    { cwd, name, target, command: [shell, "-lc", options.command] },
    signal,
  );

  return { ...result, cwd, name };
}

export interface SpawnPiOptions {
  prompt?: string;
  cwd?: string;
  name?: string;
  target?: TerminalTarget;
  model?: string;
  thinkingLevel?: string;
}

export async function spawnPi(
  backend: TerminalBackend,
  options: SpawnPiOptions,
  signal?: AbortSignal,
): Promise<OpenCommandResult & { cwd: string; name: string; model?: string; thinkingLevel?: string }> {
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? "pi-child";
  const target = options.target ?? DEFAULT_TARGET;

  const args: string[] = ["pi"];

  const model = options.model?.trim();
  if (model) args.push("--model", model);

  const thinkingLevel = options.thinkingLevel?.trim();
  if (thinkingLevel) args.push("--thinking", thinkingLevel);

  const prompt = options.prompt?.trim();
  if (prompt) {
    // Prevent option-like or file-argument-like prompts from being interpreted by pi CLI.
    args.push(/^[-@]/.test(prompt) ? `\n${prompt}` : prompt);
  }

  const result = await backend.openCommand(
    { cwd, name, target, command: args },
    signal,
  );

  return { ...result, cwd, name, model, thinkingLevel };
}

export interface SpawnAgentOptions {
  agent: AgentConfig;
  task?: string;
  cwd?: string;
  name?: string;
  target?: TerminalTarget;
}

export async function spawnAgent(
  backend: TerminalBackend,
  options: SpawnAgentOptions,
  signal?: AbortSignal,
): Promise<
  OpenCommandResult & {
    cwd: string;
    name: string;
    agent: string;
    source: AgentConfig["source"];
    model?: string;
    thinkingLevel?: string;
    tools?: string[];
  }
> {
  const { agent } = options;
  const cwd = options.cwd ?? process.cwd();
  const name = options.name ?? `agent-${agent.name}`;
  const target = options.target ?? DEFAULT_TARGET;

  const args: string[] = ["pi"];

  if (agent.model) args.push("--model", agent.model.trim());
  if (agent.thinkingLevel) args.push("--thinking", agent.thinkingLevel);
  if (agent.tools?.length) args.push("--tools", agent.tools.join(","));
  if (agent.systemPrompt.trim())
    args.push("--append-system-prompt", agent.systemPrompt.trim());

  const task = options.task?.trim();
  if (task) args.push(`Task: ${task}`);

  const result = await backend.openCommand(
    { cwd, name, target, command: args },
    signal,
  );

  return {
    ...result,
    cwd,
    name,
    agent: agent.name,
    source: agent.source,
    model: agent.model,
    thinkingLevel: agent.thinkingLevel,
    tools: agent.tools,
  };
}
