import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { registerHandoffAgentTool } from "../src/tools/handoff-agent.js";
import type { TerminalBackend } from "../src/terminal/types.js";

const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

type ToolDef = {
  execute: (
    toolCallId: string,
    params: any,
    signal: AbortSignal,
    onUpdate: (u: unknown) => void,
    ctx: any,
  ) => Promise<any>;
};

function writeAgentFile(dir: string, filename: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
}

describe("handoff_agent tool", () => {
  let tempDir: string;
  let origEnvDir: string | undefined;
  let tool: ToolDef;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-agent-tool-test-"));
    origEnvDir = process.env[ENV_AGENT_DIR];
    process.env[ENV_AGENT_DIR] = path.join(tempDir, "user-root");

    writeAgentFile(
      path.join(process.env[ENV_AGENT_DIR]!, "agents"),
      "reviewer.md",
      `---
name: reviewer
description: reviewer
---
Review prompt.`,
    );

    const mockPi = {
      registerTool(def: ToolDef) {
        tool = def;
      },
    };

    const backend: TerminalBackend = {
      async openCommand() {
        return { id: "terminal_1", stdout: "terminal_1" };
      },
    };

    registerHandoffAgentTool(mockPi as any, backend);
  });

  async function call(params: any) {
    return tool.execute("t", params, new AbortController().signal, () => {}, {
      cwd: tempDir,
      hasUI: false,
      ui: { confirm: async () => true },
    });
  }

  it("wait=false returns started message and protocol files", async () => {
    const result = await call({ agent: "reviewer", task: "do work", cwd: tempDir, wait: false });

    assert.ok(result.content[0].text.includes("Started handoff run"));
    assert.strictEqual(result.details.status, "pending");

    const runDir = result.details.runDir as string;
    assert.ok(fs.existsSync(runDir));
    for (const file of ["manifest.json", "task.md", "status.json", "result.md", "context.md", "instructions.md"]) {
      assert.ok(fs.existsSync(path.join(runDir, file)));
    }
  });

  function latestRunDir(): string {
    const base = path.join(tempDir, ".pi", "agent-runs");
    const ids = fs.readdirSync(base).sort();
    return path.join(base, ids[ids.length - 1]);
  }

  it("wait=true done returns result content", async () => {
    setTimeout(() => {
      const runDir = latestRunDir();
      fs.writeFileSync(path.join(runDir, "status.json"), JSON.stringify({ status: "done", updatedAt: new Date().toISOString(), message: "ok" }), "utf-8");
      fs.writeFileSync(path.join(runDir, "result.md"), "final answer\n", "utf-8");
    }, 20);

    const result = await call({ agent: "reviewer", task: "do work", cwd: tempDir, wait: true, timeoutMs: 300, pollIntervalMs: 10 });
    assert.strictEqual(result.content[0].text, "final answer");
    assert.strictEqual(result.details.status.status, "done");
  });

  it("blocked returns blocked outcome", async () => {
    setTimeout(() => {
      const runDir = latestRunDir();
      fs.writeFileSync(path.join(runDir, "status.json"), JSON.stringify({ status: "blocked", updatedAt: new Date().toISOString(), message: "need input" }), "utf-8");
    }, 20);

    const result = await call({ agent: "reviewer", task: "do work", cwd: tempDir, wait: true, timeoutMs: 200, pollIntervalMs: 10 });
    assert.ok(result.content[0].text.includes("ended with blocked"));
    assert.strictEqual(result.details.outcome, "blocked");
  });

  it("error returns error outcome", async () => {
    setTimeout(() => {
      const runDir = latestRunDir();
      fs.writeFileSync(path.join(runDir, "status.json"), JSON.stringify({ status: "error", updatedAt: new Date().toISOString(), message: "failed" }), "utf-8");
    }, 20);

    const result = await call({ agent: "reviewer", task: "do work", cwd: tempDir, wait: true, timeoutMs: 200, pollIntervalMs: 10 });
    assert.ok(result.content[0].text.includes("ended with error"));
    assert.strictEqual(result.details.outcome, "error");
  });

  it("timeout returns timeout outcome", async () => {
    const result = await call({ agent: "reviewer", task: "do work", cwd: tempDir, wait: true, timeoutMs: 50, pollIntervalMs: 10 });
    assert.strictEqual(result.details.outcome, "timeout");
    assert.ok(result.content[0].text.includes("Child may still be running"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (origEnvDir === undefined) delete process.env[ENV_AGENT_DIR];
    else process.env[ENV_AGENT_DIR] = origEnvDir;
  });
});
