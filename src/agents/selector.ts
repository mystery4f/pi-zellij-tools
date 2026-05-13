import type { AgentScope } from "./discovery.js";

export interface ParsedAgentSelector {
  scope?: AgentScope;
  agentName: string;
}

export function parseAgentSelector(inputRaw?: string): ParsedAgentSelector {
  const input = inputRaw?.trim() ?? "";
  if (!input) return { agentName: "" };

  const idx = input.indexOf(":");
  if (idx === -1) return { agentName: input };

  const rawPrefix = input.slice(0, idx).trim().toLowerCase();
  const agentName = input.slice(idx + 1).trim();

  if (!rawPrefix) return { agentName: input };

  if (rawPrefix === "user") return { scope: "user", agentName };
  if (rawPrefix === "project" || rawPrefix === "proj") return { scope: "project", agentName };
  if (rawPrefix === "both") return { scope: "both", agentName };

  throw new Error(`Unknown agent scope prefix "${rawPrefix}". Supported prefixes: user:, project:/proj:, both:`);
}
