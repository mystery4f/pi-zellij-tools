import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
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
    assert.strictEqual(ZellijCli.parsePaneId("terminal_1"), "terminal_1");
  });

  it("parses plugin_2", () => {
    assert.strictEqual(ZellijCli.parsePaneId("plugin_2"), "plugin_2");
  });

  it("returns null when no match", () => {
    assert.strictEqual(ZellijCli.parsePaneId("no pane here"), null);
  });

  it("does not match arbitrary prefix like foo_1", () => {
    assert.strictEqual(ZellijCli.parsePaneId("foo_1"), null);
  });

  it("extracts first match from mixed output", () => {
    assert.strictEqual(ZellijCli.parsePaneId("pane created: terminal_42"), "terminal_42");
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

    await assert.rejects(
      () => backend.openCommand({ cwd: "/tmp", name: "test", target: { type: "pane" }, command: ["echo", "hi"] }),
      (err: Error) => {
        assert.ok(err.message.includes("requires the current Pi session to be running inside Zellij"));
        return true;
      },
    );

    assert.strictEqual(called, false);
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

    assert.deepStrictEqual(capturedArgs, [
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

    await assert.rejects(
      () => backend.openCommand({
        cwd: "/tmp",
        name: "test",
        target: { type: "pane", floating: true, direction: "right" },
        command: ["echo"],
      }),
      (err: Error) => {
        assert.ok(err.message.includes("mutually exclusive"));
        return true;
      },
    );
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
    assert.deepStrictEqual(capturedCommand, ["sh", "-lc", "echo hello"]);
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
    assert.deepStrictEqual(capturedCommand, ["bash", "-lc", "echo hello"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi", "--model", "gpt-4"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi", "--thinking", "high"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi", "\n-foo"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi", "\n@REVIEW.md"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi", "hello world"]);
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
    assert.deepStrictEqual(capturedCommand, ["pi"]);
  });

  it("returns trimmed thinkingLevel in result", async () => {
    const mockBackend: TerminalBackend = {
      async openCommand() {
        return { id: null, stdout: "" };
      },
    };

    const result = await spawnPi(mockBackend, { thinkingLevel: "  high  " });
    assert.strictEqual(result.thinkingLevel, "high");
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

    assert.deepStrictEqual(capturedCommand, [
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

    assert.ok(!capturedCommand!.includes("--model"));
    assert.deepStrictEqual(capturedCommand, [
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

    assert.ok(!capturedCommand!.includes("--thinking"));
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

    assert.ok(!capturedCommand!.includes("--tools"));
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

    assert.ok(!capturedCommand!.includes("--append-system-prompt"));
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

    assert.ok(!capturedCommand!.includes("Task:"));
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
    assert.strictEqual(capturedName, "agent-my-agent");
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
    assert.strictEqual(capturedName, "custom-pane");
  });

  it("returns agent metadata in result", async () => {
    const mockBackend: TerminalBackend = {
      async openCommand() {
        return { id: "terminal_5", stdout: "" };
      },
    };

    const agent = makeAgent({ source: "project" });
    const result = await spawnAgent(mockBackend, { agent, task: "do stuff" });

    assert.strictEqual(result.agent, "reviewer");
    assert.strictEqual(result.source, "project");
    assert.strictEqual(result.model, "claude-sonnet-4-20250514");
    assert.strictEqual(result.thinkingLevel, "high");
    assert.deepStrictEqual(result.tools, ["read", "grep", "find"]);
    assert.strictEqual(result.id, "terminal_5");
  });
});
