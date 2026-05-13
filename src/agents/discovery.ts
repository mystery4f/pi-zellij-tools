import * as fs from "node:fs";
import * as path from "node:path";

import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";
export type AgentSource = "user" | "project";

const ALLOWED_THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export interface AgentConfig {
  name: string;
  description: string;
  model?: string;
  thinkingLevel?: string;
  tools?: string[];
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
}

export interface AgentDiscoveryDiagnostic {
  type: "warning" | "error";
  filePath?: string;
  message: string;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  diagnostics: AgentDiscoveryDiagnostic[];
  userAgentsDir: string;
  projectAgentsDir: string | null;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, ".pi", "agents");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function loadAgentsFromDir(
  dir: string,
  source: AgentSource,
): { agents: AgentConfig[]; diagnostics: AgentDiscoveryDiagnostic[] } {
  const agents: AgentConfig[] = [];
  const diagnostics: AgentDiscoveryDiagnostic[] = [];

  if (!fs.existsSync(dir)) {
    return { agents, diagnostics };
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { agents, diagnostics };
  }

  const seenNames = new Set<string>();

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      diagnostics.push({
        type: "error",
        filePath,
        message: `Failed to read file: ${entry.name}`,
      });
      continue;
    }

    let frontmatter: Record<string, unknown>;
    let body: string;
    try {
      const parsed = parseFrontmatter<Record<string, unknown>>(content);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch (err) {
      diagnostics.push({
        type: "error",
        filePath,
        message: `Failed to parse frontmatter in ${entry.name}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // Validate required fields
    const name =
      typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
    const description =
      typeof frontmatter.description === "string"
        ? frontmatter.description.trim()
        : "";

    if (!name || !description) {
      diagnostics.push({
        type: "warning",
        filePath,
        message: `Skipping ${entry.name}: missing required "name" or "description" in frontmatter.`,
      });
      continue;
    }

    // Duplicate name check within same scope
    if (seenNames.has(name)) {
      diagnostics.push({
        type: "warning",
        filePath,
        message: `Duplicate agent name "${name}" in ${source} scope from ${entry.name}; keeping first occurrence.`,
      });
      continue;
    }

    // Validate thinkingLevel
    let thinkingLevel: string | undefined;
    if (typeof frontmatter.thinkingLevel === "string") {
      const tl = frontmatter.thinkingLevel.trim();
      if (ALLOWED_THINKING_LEVELS.has(tl)) {
        thinkingLevel = tl;
      } else {
        diagnostics.push({
          type: "warning",
          filePath,
          message: `Invalid thinkingLevel "${tl}" in ${entry.name}; ignoring.`,
        });
      }
    }

    // Parse tools: comma string or YAML array
    let tools: string[] | undefined;
    if (typeof frontmatter.tools === "string") {
      tools = frontmatter.tools
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);
    } else if (Array.isArray(frontmatter.tools)) {
      tools = (frontmatter.tools as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    if (tools && tools.length === 0) tools = undefined;

    seenNames.add(name);

    agents.push({
      name,
      description,
      model:
        typeof frontmatter.model === "string"
          ? frontmatter.model.trim() || undefined
          : undefined,
      thinkingLevel,
      tools,
      systemPrompt: body.trim(),
      source,
      filePath: path.resolve(filePath),
    });
  }

  return { agents, diagnostics };
}

export function discoverAgents(
  cwd: string,
  scope: AgentScope = "user",
): AgentDiscoveryResult {
  const userAgentsDir = path.join(getAgentDir(), "agents");
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);

  const allDiagnostics: AgentDiscoveryDiagnostic[] = [];

  const userResult =
    scope === "project"
      ? { agents: [] as AgentConfig[], diagnostics: [] as AgentDiscoveryDiagnostic[] }
      : loadAgentsFromDir(userAgentsDir, "user");
  allDiagnostics.push(...userResult.diagnostics);

  const projectResult =
    scope === "user" || !projectAgentsDir
      ? { agents: [] as AgentConfig[], diagnostics: [] as AgentDiscoveryDiagnostic[] }
      : loadAgentsFromDir(projectAgentsDir, "project");
  allDiagnostics.push(...projectResult.diagnostics);

  const agentMap = new Map<string, AgentConfig>();

  // Load user agents first
  for (const agent of userResult.agents) {
    agentMap.set(agent.name, agent);
  }

  if (scope === "both" || scope === "project") {
    // Project agents override user agents of the same name
    for (const agent of projectResult.agents) {
      if (agentMap.has(agent.name)) {
        allDiagnostics.push({
          type: "warning",
          filePath: agent.filePath,
          message: `Project agent "${agent.name}" overrides user agent.`,
        });
      }
      agentMap.set(agent.name, agent);
    }
  }

  return {
    agents: Array.from(agentMap.values()),
    diagnostics: allDiagnostics,
    userAgentsDir,
    projectAgentsDir,
  };
}

export function formatAgentList(
  agents: AgentConfig[],
  maxItems: number = 20,
): string {
  if (agents.length === 0) return "No agents found.";

  const lines: string[] = [];
  const shown = agents.slice(0, maxItems);
  for (const agent of shown) {
    let line = `- ${agent.name} (${agent.source}): ${agent.description}`;
    if (agent.model) line += ` [model: ${agent.model}]`;
    lines.push(line);
  }

  const remaining = agents.length - shown.length;
  if (remaining > 0) {
    lines.push(`... and ${remaining} more.`);
  }

  return lines.join("\n");
}
