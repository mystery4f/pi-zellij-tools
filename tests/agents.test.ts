import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { discoverAgents, formatAgentList } from "../src/agents/discovery.js";
import type { AgentConfig } from "../src/agents/discovery.js";

const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

let tempDir: string;
let origEnvDir: string | undefined;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
  // Isolate from real ~/.pi/agent/agents by pointing user dir to temp
  origEnvDir = process.env[ENV_AGENT_DIR];
  process.env[ENV_AGENT_DIR] = path.join(tempDir, "user-root");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  // Restore original env
  if (origEnvDir === undefined) {
    delete process.env[ENV_AGENT_DIR];
  } else {
    process.env[ENV_AGENT_DIR] = origEnvDir;
  }
});

function writeAgentFile(dir: string, filename: string, content: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

/** Get the temp user agents dir (<tempDir>/user-root/agents) */
function userAgentsDir(): string {
  return path.join(process.env[ENV_AGENT_DIR]!, "agents");
}

/** Get the temp project agents dir (<tempDir>/.pi/agents) */
function projectAgentsDir(base: string = tempDir): string {
  return path.join(base, ".pi", "agents");
}

describe("discoverAgents", () => {
  it("returns empty when no agents directory exists", () => {
    const result = discoverAgents("/tmp/nonexistent-dir-for-test", "user");
    expect(result.agents).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("discovers user agents with valid frontmatter", () => {
    writeAgentFile(
      userAgentsDir(),
      "reviewer.md",
      `---
name: reviewer
description: Code reviewer
model: claude-sonnet-4-20250514
thinkingLevel: high
tools: read,grep,find,ls
---
You are a reviewer.`,
    );

    const result = discoverAgents(tempDir, "user");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("reviewer");
    expect(result.agents[0].description).toBe("Code reviewer");
    expect(result.agents[0].model).toBe("claude-sonnet-4-20250514");
    expect(result.agents[0].thinkingLevel).toBe("high");
    expect(result.agents[0].tools).toEqual(["read", "grep", "find", "ls"]);
    expect(result.agents[0].source).toBe("user");
    expect(result.agents[0].systemPrompt).toBe("You are a reviewer.");
  });

  it("skips files without required name/description", () => {
    writeAgentFile(
      projectAgentsDir(),
      "invalid.md",
      `---
description: Missing name
---
Some prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].type).toBe("warning");
    expect(result.diagnostics[0].message).toContain("missing required");
  });

  it("skips files without frontmatter", () => {
    writeAgentFile(projectAgentsDir(), "no-fm.md", "Just plain text, no frontmatter.");

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].type).toBe("warning");
  });

  it("parses tools as comma string", () => {
    writeAgentFile(
      projectAgentsDir(),
      "agent1.md",
      `---
name: agent1
description: Test agent
tools: read,bash, grep , find
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].tools).toEqual(["read", "bash", "grep", "find"]);
  });

  it("parses tools as YAML array", () => {
    writeAgentFile(
      projectAgentsDir(),
      "agent2.md",
      `---
name: agent2
description: Test agent
tools:
  - read
  - grep
  - find
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].tools).toEqual(["read", "grep", "find"]);
  });

  it("ignores invalid thinkingLevel", () => {
    writeAgentFile(
      projectAgentsDir(),
      "bad-tl.md",
      `---
name: bad-tl
description: Bad thinking level
thinkingLevel: turbo
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].thinkingLevel).toBeUndefined();
    expect(result.diagnostics.some((d) => d.message.includes("Invalid thinkingLevel"))).toBe(true);
  });

  it("detects duplicate names within same scope (keeps first, warns)", () => {
    writeAgentFile(
      projectAgentsDir(),
      "first.md",
      `---
name: dup
description: First
---
First prompt.`,
    );
    writeAgentFile(
      projectAgentsDir(),
      "second.md",
      `---
name: dup
description: Second
---
Second prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    // Exactly one agent is kept (order depends on filesystem readdir)
    expect(["First", "Second"]).toContain(result.agents[0].description);
    expect(result.diagnostics.some((d) => d.message.includes("Duplicate"))).toBe(true);
  });

  it("project overrides user in 'both' scope", () => {
    // Write user-level agent
    writeAgentFile(
      userAgentsDir(),
      "tool-user.md",
      `---
name: shared
description: User version
tools: read
---
User prompt.`,
    );

    // Write project-level agent with same name
    writeAgentFile(
      projectAgentsDir(),
      "tool-user.md",
      `---
name: shared
description: Project version
tools: write
---
Project prompt.`,
    );

    const result = discoverAgents(tempDir, "both");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("shared");
    expect(result.agents[0].description).toBe("Project version");
    expect(result.agents[0].source).toBe("project");
    expect(result.agents[0].systemPrompt).toBe("Project prompt.");
    // Should produce override warning
    expect(result.diagnostics.some((d) => d.message.includes("overrides"))).toBe(true);
  });

  it("sets filePath to absolute path", () => {
    writeAgentFile(
      projectAgentsDir(),
      "myagent.md",
      `---
name: myagent
description: Test
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(path.isAbsolute(result.agents[0].filePath)).toBe(true);
  });

  it("discovers project agents from .pi/agents directory", () => {
    writeAgentFile(
      projectAgentsDir(),
      "helper.md",
      `---
name: helper
description: A helper agent
model: gpt-4
---
You help.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("helper");
    expect(result.agents[0].description).toBe("A helper agent");
    expect(result.agents[0].model).toBe("gpt-4");
    expect(result.agents[0].source).toBe("project");
    expect(result.agents[0].systemPrompt).toBe("You help.");
  });

  it("skips non-.md files", () => {
    writeAgentFile(
      projectAgentsDir(),
      "helper.md",
      `---
name: helper
description: Good
---
Good.`,
    );
    writeAgentFile(projectAgentsDir(), "readme.txt", "Not an agent.");
    writeAgentFile(projectAgentsDir(), "config.json", '{"name":"bad"}');

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("helper");
  });

  it("empty tools array is treated as undefined", () => {
    writeAgentFile(
      projectAgentsDir(),
      "no-tools.md",
      `---
name: no-tools
description: No tools
tools:
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].tools).toBeUndefined();
  });

  it("trims whitespace from model and thinkingLevel", () => {
    writeAgentFile(
      projectAgentsDir(),
      "trimmed.md",
      `---
name: trimmed
description: Test
model: "  gpt-4  "
thinkingLevel: "  high  "
---
Prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].model).toBe("gpt-4");
    expect(result.agents[0].thinkingLevel).toBe("high");
  });

  it("handles broken YAML frontmatter gracefully", () => {
    writeAgentFile(
      projectAgentsDir(),
      "broken.md",
      `---
name: broken
description: test
invalid: [unclosed
---
Body text.`,
    );

    const result = discoverAgents(tempDir, "project");
    // The file should be skipped; may or may not have agents depending on
    // whether parseFrontmatter throws or returns partial data.
    // The key assertion: discoverAgents() must NOT throw.
    expect(result.agents).toBeInstanceOf(Array);
    expect(result.diagnostics).toBeInstanceOf(Array);
    // If the parser threw, there should be an error diagnostic
    if (result.agents.length === 0) {
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it("handles completely malformed frontmatter delimiter", () => {
    // File with --- in weird positions that might confuse parser
    writeAgentFile(
      projectAgentsDir(),
      "malformed.md",
      `---
: bad
: also-bad
---
Body.`,
    );

    // Must not throw
    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toBeInstanceOf(Array);
    expect(result.diagnostics).toBeInstanceOf(Array);
  });

  it("discovers both user and project agents", () => {
    writeAgentFile(
      userAgentsDir(),
      "user-agent.md",
      `---
name: user-agent
description: From user
---
User prompt.`,
    );

    writeAgentFile(
      projectAgentsDir(),
      "proj-agent.md",
      `---
name: proj-agent
description: From project
---
Project prompt.`,
    );

    const result = discoverAgents(tempDir, "both");
    expect(result.agents).toHaveLength(2);
    const names = result.agents.map((a) => a.name).sort();
    expect(names).toEqual(["proj-agent", "user-agent"]);
    const userA = result.agents.find((a) => a.name === "user-agent")!;
    const projA = result.agents.find((a) => a.name === "proj-agent")!;
    expect(userA.source).toBe("user");
    expect(projA.source).toBe("project");
  });

  it("scope 'user' excludes project agents", () => {
    writeAgentFile(
      userAgentsDir(),
      "user-agent.md",
      `---
name: user-agent
description: From user
---
User prompt.`,
    );

    writeAgentFile(
      projectAgentsDir(),
      "proj-agent.md",
      `---
name: proj-agent
description: From project
---
Project prompt.`,
    );

    const result = discoverAgents(tempDir, "user");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("user-agent");
    expect(result.agents[0].source).toBe("user");
  });

  it("scope 'project' excludes user agents", () => {
    writeAgentFile(
      userAgentsDir(),
      "user-agent.md",
      `---
name: user-agent
description: From user
---
User prompt.`,
    );

    writeAgentFile(
      projectAgentsDir(),
      "proj-agent.md",
      `---
name: proj-agent
description: From project
---
Project prompt.`,
    );

    const result = discoverAgents(tempDir, "project");
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe("proj-agent");
    expect(result.agents[0].source).toBe("project");
  });
});

describe("formatAgentList", () => {
  it("returns 'No agents found.' for empty array", () => {
    expect(formatAgentList([])).toBe("No agents found.");
  });

  it("formats agents with source and description", () => {
    const agents: AgentConfig[] = [
      { name: "a", description: "Agent A", systemPrompt: "", source: "user", filePath: "/a.md" },
      { name: "b", description: "Agent B", model: "gpt-4", systemPrompt: "", source: "project", filePath: "/b.md" },
    ];
    const text = formatAgentList(agents);
    expect(text).toContain("- a (user): Agent A");
    expect(text).toContain("- b (project): Agent B [model: gpt-4]");
  });

  it("truncates to maxItems", () => {
    const agents: AgentConfig[] = Array.from({ length: 5 }, (_, i) => ({
      name: `agent-${i}`,
      description: `Agent ${i}`,
      systemPrompt: "",
      source: "user" as const,
      filePath: `/agent-${i}.md`,
    }));
    const text = formatAgentList(agents, 3);
    expect(text).toContain("... and 2 more.");
  });
});
