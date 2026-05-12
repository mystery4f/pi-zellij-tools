import type { TerminalBackend, OpenCommandOptions, OpenCommandResult, CommandExecutor } from "./types.js";

const MAX_OUTPUT_LENGTH = 4096;

function truncate(str: string, max = MAX_OUTPUT_LENGTH): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n...[truncated ${str.length - max} chars]`;
}

export class ZellijCli {
  constructor(private readonly execCommand: CommandExecutor) {}

  static isInsideZellij(): boolean {
    return !!(process.env.ZELLIJ_SESSION_NAME && process.env.ZELLIJ_PANE_ID);
  }

  async exec(args: string[], signal?: AbortSignal, timeout = 10_000): Promise<{ code: number; stdout: string; stderr: string; killed: boolean }> {
    return this.execCommand("zellij", args, { signal, timeout });
  }

  static parsePaneId(stdout: string): string | null {
    return stdout.match(/(?:terminal|plugin)_\d+/)?.[0] ?? null;
  }

  async newPane(args: string[], signal?: AbortSignal): Promise<OpenCommandResult> {
    const result = await this.exec(["action", "new-pane", ...args], signal);
    if (result.code !== 0) {
      const reason = result.killed
        ? "zellij process was killed (possibly timed out)"
        : truncate(result.stderr.trim()) || truncate(result.stdout.trim()) || `exit code ${result.code}`;
      throw new Error(`zellij failed: ${reason}`);
    }

    const stdout = result.stdout.trim();
    const paneId = ZellijCli.parsePaneId(stdout);

    return { id: paneId, stdout: truncate(stdout) };
  }
}

export class ZellijTerminalBackend implements TerminalBackend {
  private readonly cli: ZellijCli;

  constructor(execCommand: CommandExecutor) {
    this.cli = new ZellijCli(execCommand);
  }

  async openCommand(options: OpenCommandOptions, signal?: AbortSignal): Promise<OpenCommandResult> {
    if (!ZellijCli.isInsideZellij()) {
      throw new Error("Terminal backend requires the current Pi session to be running inside Zellij.");
    }

    const { target, cwd, name, command } = options;

    if (target.type !== "pane") {
      throw new Error(`Unsupported terminal target type: "${target.type}". Currently only "pane" is supported.`);
    }

    if (target.floating && target.direction) {
      throw new Error(
        `"floating" and "direction" are mutually exclusive. Use "floating" for a floating pane, or "direction" for a tiled pane, not both.`,
      );
    }

    const args = ["--cwd", cwd, "--name", name];

    if (target.floating) {
      args.push("--floating");
    } else if (target.direction) {
      args.push("--direction", target.direction);
    }

    args.push("--", ...command);

    return this.cli.newPane(args, signal);
  }
}
