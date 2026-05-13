import { describe, it, expect, beforeEach } from "bun:test";
import { ZellijCli, ZellijTerminalBackend } from "../src/terminal/zellij.js";
import { runShell, spawnPi, spawnAgent } from "../src/terminal/actions.js";
import type { AgentConfig } from "../src/agents/discovery.js";
import type { CommandExecutor, CommandExecutorResult, TerminalBackend } from "../src/terminal/types.js";

function mockExecutor(result: Partial<CommandExecutorResult> = {}): CommandExecutor {
  return async () => ({
    code: 0,
    stdout: "",
    stderr: "",
    killed: false,
    ...result,
  });
}

describe("ZellijCli.parsePaneId", () => {
  it("parses terminal_1", () => {
    expect(ZellijCli.parsePaneId("terminal_1")).toBe("terminal_1");
  });

  it("parses plugin_2", () => {
    expect(ZellijCli.parsePaneId("plugin_2")).toBe("plugin_2");
  });

  it("returns null when no match", () => {
    expect(ZellijCli.parsePaneId("no pane here")).toBeNull();
  });

  it("does not match arbitrary prefix like foo_1", () => {
    expect(ZellijCli.parsePaneId("foo_1")).toBeNull();
  });

  it("extracts first match from mixed output", () => {
    expect(ZellijCli.parsePaneId("pane created: terminal_42")).toBe("terminal_42");
  });
});

describe("ZellijTerminalBackend", () => {
  let originalSessionName: string | undefined;
  let originalPaneId: string | undefined;

  beforeEach(() => {
    originalSessionName = process.env.ZELLIJ_SESSION_NAME;
    originalPaneId = process.env.ZELLIJ_PANE_ID;
  });

  it("rejects when not inside Zellij and does not call executor", async () => {
    delete process.env.ZELLIJ_SESSION_NAME;
    delete process.env.ZELLIJ_PANE_ID;

    let called = false;
    const backend = new ZellijTerminalBackend(async () => {
      called = true;
      return { code: 0, stdout: "", stderr: "", killed: false };
    });

    await expect(
      backend.openCommand({ cwd: "/tmp", name: "test", target: { type: "pane" }, command: ["echo", "hi"] }),
    ).rejects.toThrow("requires the current Pi session to be running inside Zellij");

    expect(called).toBe(false);
  });

  it("constructs zellij action new-pane with -- separator", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session";
    process.env.ZELLIJ_PANE_ID = "terminal_1";

    let capturedArgs: string[] | undefined;
    const backend = new ZellijTerminalBackend(async (_cmd, args) => {
      capturedArgs = args;
      return { code: 0, stdout: "terminal_99", stderr: "", killed: false };
    });

    await backend.openCommand({
      cwd: "/tmp",
      name: "my-pane",
      target: { type: "pane", direction: "right" },
      command: ["pi", "--model", "test"],
    });

    expect(capturedArgs).toEqual([
      "action", "new-pane",
      "--cwd", "/tmp",
      "--name", "my-pane",
      "--direction", "right",
      "--", "pi", "--model", "test",
    ]);
  });

  it("throws when floating and direction are both set", async () => {
    process.env.ZELLIJ_SESSION_NAME = "test-session";
    process.env.ZELLIJ_PANE_ID = "terminal_1";

    const backend = new ZellijTerminalBackend(mockExecutor());

    await expect(
      backend.openCommand({
        cwd: "/tmp",
        name: "test",
        target: { type: "pane", floating: true, direction: "right" },
        command: ["echo"],
      }),
    ).rejects.toThrow("mutually exclusive");
  });
});

describe("runShell", () => {
  it("uses default shell sh", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await runShell(mockBackend, { command: "echo hello" });
    expect(capturedCommand).toEqual(["sh", "-lc", "echo hello"]);
  });

  it("uses custom shell", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await runShell(mockBackend, { command: "echo hello", shell: "bash" });
    expect(capturedCommand).toEqual(["bash", "-lc", "echo hello"]);
  });
});

describe("spawnPi", () => {
  it("trims model and omits when blank", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { model: "  gpt-4  " });
    expect(capturedCommand).toEqual(["pi", "--model", "gpt-4"]);
  });

  it("does not push blank model", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { model: "   " });
    expect(capturedCommand).toEqual(["pi"]);
  });

  it("trims thinkingLevel and omits when blank", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { thinkingLevel: "  high  " });
    expect(capturedCommand).toEqual(["pi", "--thinking", "high"]);
  });

  it("does not push blank thinkingLevel", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { thinkingLevel: "   " });
    expect(capturedCommand).toEqual(["pi"]);
  });

  it("prefixes prompt starting with -", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { prompt: "-foo" });
    expect(capturedCommand).toEqual(["pi", "\n-foo"]);
  });

  it("prefixes prompt starting with @", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { prompt: "@REVIEW.md" });
    expect(capturedCommand).toEqual(["pi", "\n@REVIEW.md"]);
  });

  it("does not prefix regular prompt", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { prompt: "hello world" });
    expect(capturedCommand).toEqual(["pi", "hello world"]);
  });

  it("does not push empty prompt", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    await spawnPi(mockBackend, { prompt: "   " });
    expect(capturedCommand).toEqual(["pi"]);
  });

  it("returns trimmed thinkingLevel in result", async () => {
    const mockBackend: TerminalBackend = {
      async openCommand() {
        return { id: null, stdout: "" };
      },
    };

    const result = await spawnPi(mockBackend, { thinkingLevel: "  high  " });
    expect(result.thinkingLevel).toBe("high");
  });
});

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "reviewer",
    description: "Code reviewer",
    model: "claude-sonnet-4-20250514",
    thinkingLevel: "high",
    tools: ["read", "grep", "find"],
    systemPrompt: "You are a reviewer.",
    source: "user",
    filePath: "/tmp/reviewer.md",
    ...overrides,
  };
}

describe("spawnAgent", () => {
  it("constructs pi command with all agent fields", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: "terminal_1", stdout: "" };
      },
    };

    const agent = makeAgent();
    await spawnAgent(mockBackend, { agent, task: "review the diff" });

    expect(capturedCommand).toEqual([
      "pi",
      "--model", "claude-sonnet-4-20250514",
      "--thinking", "high",
      "--tools", "read,grep,find",
      "--append-system-prompt", "You are a reviewer.",
      "Task: review the diff",
    ]);
  });

  it("omits model when not set", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent({ model: undefined });
    await spawnAgent(mockBackend, { agent });

    expect(capturedCommand).not.toContain("--model");
    expect(capturedCommand).toEqual([
      "pi",
      "--thinking", "high",
      "--tools", "read,grep,find",
      "--append-system-prompt", "You are a reviewer.",
    ]);
  });

  it("omits thinkingLevel when not set", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent({ thinkingLevel: undefined });
    await spawnAgent(mockBackend, { agent });

    expect(capturedCommand).not.toContain("--thinking");
  });

  it("omits tools when empty array", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent({ tools: [] });
    await spawnAgent(mockBackend, { agent });

    expect(capturedCommand).not.toContain("--tools");
  });

  it("omits system prompt when empty", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent({ systemPrompt: "" });
    await spawnAgent(mockBackend, { agent });

    expect(capturedCommand).not.toContain("--append-system-prompt");
  });

  it("omits task when not provided", async () => {
    let capturedCommand: string[] | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedCommand = options.command;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent();
    await spawnAgent(mockBackend, { agent });

    expect(capturedCommand).not.toContain("Task:");
  });

  it("uses default pane name agent-<name>", async () => {
    let capturedName: string | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedName = options.name;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent({ name: "my-agent" });
    await spawnAgent(mockBackend, { agent });
    expect(capturedName).toBe("agent-my-agent");
  });

  it("uses custom name when provided", async () => {
    let capturedName: string | undefined;
    const mockBackend: TerminalBackend = {
      async openCommand(options) {
        capturedName = options.name;
        return { id: null, stdout: "" };
      },
    };

    const agent = makeAgent();
    await spawnAgent(mockBackend, { agent, name: "custom-pane" });
    expect(capturedName).toBe("custom-pane");
  });

  it("returns agent metadata in result", async () => {
    const mockBackend: TerminalBackend = {
      async openCommand() {
        return { id: "terminal_5", stdout: "" };
      },
    };

    const agent = makeAgent({ source: "project" });
    const result = await spawnAgent(mockBackend, { agent, task: "do stuff" });

    expect(result.agent).toBe("reviewer");
    expect(result.source).toBe("project");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.thinkingLevel).toBe("high");
    expect(result.tools).toEqual(["read", "grep", "find"]);
    expect(result.id).toBe("terminal_5");
  });
});
