import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { registerSpawnAgentTool } from "../src/tools/spawn-agent.js";
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

describe("spawn_agent tool scope prefix", () => {
  let tempDir: string;
  let origEnvDir: string | undefined;
  let tool: ToolDef;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spawn-agent-tool-test-"));
    origEnvDir = process.env[ENV_AGENT_DIR];
    process.env[ENV_AGENT_DIR] = path.join(tempDir, "user-root");

    writeAgentFile(
      path.join(process.env[ENV_AGENT_DIR]!, "agents"),
      "reviewer.md",
      `---
name: reviewer
description: user reviewer
---
User prompt.`,
    );

    writeAgentFile(
      path.join(tempDir, ".pi", "agents"),
      "reviewer.md",
      `---
name: reviewer
description: project reviewer
---
Project prompt.`,
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

    registerSpawnAgentTool(mockPi as any, backend);
  });

  it("lists project agents for proj: prefix without name", async () => {
    const result = await tool.execute(
      "t1",
      { agent: "proj:", cwd: tempDir },
      new AbortController().signal,
      () => {},
      { cwd: tempDir, hasUI: true, ui: { confirm: async () => true } },
    );

    assert.strictEqual(result.isError, undefined);
    assert.ok(result.content[0].text.includes("scope: project"));
    assert.strictEqual(result.details.agents.length, 1);
    assert.strictEqual(result.details.agents[0].source, "project");
  });

  it("uses project agent for both: when names collide", async () => {
    const result = await tool.execute(
      "t2",
      { agent: "both:reviewer", cwd: tempDir, confirmProjectAgents: false },
      new AbortController().signal,
      () => {},
      { cwd: tempDir, hasUI: false, ui: { confirm: async () => true } },
    );

    assert.strictEqual(result.isError, undefined);
    assert.strictEqual(result.details.source, "project");
    assert.strictEqual(result.details.agent, "reviewer");
  });

  it("errors on conflicting prefix scope and agentScope", async () => {
    const result = await tool.execute(
      "t3",
      { agent: "proj:reviewer", agentScope: "user", cwd: tempDir },
      new AbortController().signal,
      () => {},
      { cwd: tempDir, hasUI: true, ui: { confirm: async () => true } },
    );

    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes("Conflicting scope"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (origEnvDir === undefined) delete process.env[ENV_AGENT_DIR];
    else process.env[ENV_AGENT_DIR] = origEnvDir;
  });
});
