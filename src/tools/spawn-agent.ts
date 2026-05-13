import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { spawnAgent } from "../terminal/actions.js";
import type { TerminalBackend } from "../terminal/types.js";
import { resolveCwd, normalizeTarget } from "./common.js";
import { TargetSchema, AgentScopeSchema } from "./schemas.js";
import { discoverAgents, formatAgentList } from "../agents/discovery.js";
import type { AgentConfig } from "../agents/discovery.js";
import { parseAgentSelector } from "../agents/selector.js";

export function registerSpawnAgentTool(
  pi: ExtensionAPI,
  backend: TerminalBackend,
): void {
  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn Agent",
    description: "Start a configured pi agent session in a new terminal target.",
    promptSnippet: "Start a configured agent session in a separate visible terminal",
    promptGuidelines: [
      "Use spawn_agent when the user asks to start a named configured agent in a separate visible terminal.",
      "Do not wait for the child Pi session started by spawn_agent to finish.",
      "Call spawn_agent without an agent name to list configured agents.",
    ],
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name from agents/*.md. Omit to list available agents." })),
      task: Type.Optional(Type.String({ description: "Initial task prompt for the agent." })),
      agentScope: Type.Optional(AgentScopeSchema),
      confirmProjectAgents: Type.Optional(Type.Boolean({ description: "Whether to confirm before using project-level agents. Default: true." })),
      cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to current cwd." })),
      name: Type.Optional(Type.String({ description: "Name for the terminal target. Defaults to agent-<name>." })),
      target: Type.Optional(TargetSchema),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = resolveCwd(params.cwd, ctx.cwd);

      let parsed;
      try {
        parsed = parseAgentSelector(params.agent);
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
          details: {},
        };
      }

      if (parsed.scope && params.agentScope && parsed.scope !== params.agentScope) {
        return {
          content: [{ type: "text", text: `Conflicting scope: agent prefix uses "${parsed.scope}" but agentScope is "${params.agentScope}".` }],
          isError: true,
          details: {},
        };
      }

      const scope = parsed.scope ?? params.agentScope ?? "user";
      const discovery = discoverAgents(cwd, scope);

      // Trim agent name; blank/whitespace treated as "not provided"
      const agentName = parsed.agentName;

      // No agent name provided: list available agents
      if (!agentName) {
        const list = formatAgentList(discovery.agents);
        const diagnosticsText = discovery.diagnostics.length > 0
          ? "\n\nDiagnostics:\n" + discovery.diagnostics.map((d) => `  [${d.type}] ${d.message}`).join("\n")
          : "";

        return {
          content: [
            {
              type: "text",
              text: `Available agents (scope: ${scope}):\nUser dir: ${discovery.userAgentsDir}${discovery.projectAgentsDir ? `\nProject dir: ${discovery.projectAgentsDir}` : ""}\n\n${list}${diagnosticsText}`,
            },
          ],
          details: {
            agents: discovery.agents.map((a) => ({ name: a.name, source: a.source, description: a.description })),
            userAgentsDir: discovery.userAgentsDir,
            projectAgentsDir: discovery.projectAgentsDir,
            diagnostics: discovery.diagnostics,
          },
        };
      }

      // Find agent by name
      const agent = discovery.agents.find((a) => a.name === agentName);
      if (!agent) {
        const list = formatAgentList(discovery.agents);
        const diagnosticsText = discovery.diagnostics.length > 0
          ? "\n\nDiagnostics:\n" + discovery.diagnostics.map((d) => `  [${d.type}] ${d.message}`).join("\n")
          : "";

        return {
          content: [
            {
              type: "text",
              text: `Agent "${agentName}" not found.\n\nAvailable agents:\n${list}${diagnosticsText}`,
            },
          ],
          isError: true,
          details: { diagnostics: discovery.diagnostics },
        };
      }

      // Project agent confirmation
      const confirmProject = params.confirmProjectAgents ?? true;
      if (agent.source === "project" && confirmProject) {
        if (!ctx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text: `Agent "${agent.name}" is a project-level agent (${agent.filePath}). Cannot confirm without UI. Pass confirmProjectAgents: false to use it directly.`,
              },
            ],
            isError: true,
            details: { agent: agent.name, source: agent.source, filePath: agent.filePath },
          };
        }

        const confirmed = await ctx.ui.confirm(
          "Project Agent Confirmation",
          `Agent "${agent.name}" is from the project directory:\n${agent.filePath}\n\nDo you want to use this project-level agent?`,
        );

        if (!confirmed) {
          return {
            content: [
              {
                type: "text",
                text: `Cancelled: project agent "${agent.name}" was not confirmed.`,
              },
            ],
            details: { cancelled: true, agent: agent.name, source: agent.source },
          };
        }
      }

      // Spawn the agent
      const result = await spawnAgent(
        backend,
        {
          agent: agent as AgentConfig,
          task: params.task,
          cwd,
          name: params.name,
          target: normalizeTarget(params.target),
        },
        signal,
      );

      const diagnosticsText = discovery.diagnostics.length > 0
        ? "\n\nDiagnostics:\n" + discovery.diagnostics.map((d) => `  [${d.type}] ${d.message}`).join("\n")
        : "";

      return {
        content: [
          {
            type: "text",
            text: result.id
              ? `Started agent "${result.agent}" (${result.source}) in terminal target "${result.name}" (${result.id}) in ${result.cwd}.${diagnosticsText}`
              : `Started agent "${result.agent}" (${result.source}) in terminal target "${result.name}" in ${result.cwd}. (ID not captured: ${result.stdout || "(empty)"})${diagnosticsText}`,
          },
        ],
        details: {
          id: result.id,
          cwd: result.cwd,
          name: result.name,
          agent: result.agent,
          source: result.source,
          filePath: agent.filePath,
          model: result.model,
          thinkingLevel: result.thinkingLevel,
          tools: result.tools,
          stdout: result.stdout,
          diagnostics: discovery.diagnostics,
        },
      };
    },
  });
}
