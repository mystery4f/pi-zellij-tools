export type TerminalDirection = "right" | "down";

export type TerminalTarget = {
  type: "pane";
  direction?: TerminalDirection;
  floating?: boolean;
};

export interface OpenCommandOptions {
  cwd: string;
  name: string;
  target: TerminalTarget;
  command: string[];
}

export interface OpenCommandResult {
  id: string | null;
  stdout: string;
}

export interface TerminalBackend {
  openCommand(options: OpenCommandOptions, signal?: AbortSignal): Promise<OpenCommandResult>;
}

export interface CommandExecutorOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeout?: number;
}

export interface CommandExecutorResult {
  code: number;
  stdout: string;
  stderr: string;
  killed: boolean;
}

export type CommandExecutor = (
  command: string,
  args: string[],
  options?: CommandExecutorOptions,
) => Promise<CommandExecutorResult>;
