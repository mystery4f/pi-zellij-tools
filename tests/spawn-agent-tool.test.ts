import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("scope: project");
    expect(result.details.agents).toHaveLength(1);
    expect(result.details.agents[0].source).toBe("project");
  });

  it("uses project agent for both: when names collide", async () => {
    const result = await tool.execute(
      "t2",
      { agent: "both:reviewer", cwd: tempDir, confirmProjectAgents: false },
      new AbortController().signal,
      () => {},
      { cwd: tempDir, hasUI: false, ui: { confirm: async () => true } },
    );

    expect(result.isError).toBeUndefined();
    expect(result.details.source).toBe("project");
    expect(result.details.agent).toBe("reviewer");
  });

  it("errors on conflicting prefix scope and agentScope", async () => {
    const result = await tool.execute(
      "t3",
      { agent: "proj:reviewer", agentScope: "user", cwd: tempDir },
      new AbortController().signal,
      () => {},
      { cwd: tempDir, hasUI: true, ui: { confirm: async () => true } },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Conflicting scope");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (origEnvDir === undefined) delete process.env[ENV_AGENT_DIR];
    else process.env[ENV_AGENT_DIR] = origEnvDir;
  });
});
