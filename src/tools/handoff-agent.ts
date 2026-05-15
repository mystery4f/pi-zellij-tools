import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { TerminalBackend } from "../terminal/types.js";
import { spawnAgent } from "../terminal/actions.js";
import { resolveCwd, normalizeTarget } from "./common.js";
import { AgentScopeSchema, TargetSchema } from "./schemas.js";
import { discoverAgents, formatAgentList } from "../agents/discovery.js";
import { parseAgentSelector } from "../agents/selector.js";
import { createRun, updateManifestPaneId, waitForCompletion } from "../agent-runs/store.js";

function buildInstructions(runDir: string): string {
  return `# Handoff Instructions\n\nRun dir: ${runDir}\n\n1. Read task.md, context.md, and instructions.md in the run dir.\n2. Work independently.\n3. Update status.json as progress changes.\n4. Write final answer to result.md.\n5. Set status.json.status to done when complete.\n6. Use blocked or error if unable to complete.`;
}

export function registerHandoffAgentTool(pi: ExtensionAPI, backend: TerminalBackend): void {
  pi.registerTool({
    name: "handoff_agent",
    label: "Handoff Agent",
    description: "Start a visible child agent and wait for file-backed result output.",
    promptSnippet: "Delegate a bounded subtask to a visible child agent and return its result",
    promptGuidelines: [
      "Use for bounded independent subtasks with clear output expectations.",
      "Provide task, context, and boundaries; do not pass full conversation history.",
      "Prefer analysis, review, research, and investigation work.",
    ],
    parameters: Type.Object({
      agent: Type.String({ description: "Agent name from agents/*.md." }),
      task: Type.String({ description: "Delegated task to execute." }),
      context: Type.Optional(Type.String({ description: "Filtered relevant context for the child." })),
      agentScope: Type.Optional(AgentScopeSchema),
      confirmProjectAgents: Type.Optional(Type.Boolean({ description: "Whether to confirm project-level agents. Default: true." })),
      cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to current cwd." })),
      name: Type.Optional(Type.String({ description: "Terminal target name. Defaults to handoff-<agent>." })),
      target: Type.Optional(TargetSchema),
      timeoutMs: Type.Optional(Type.Number({ description: "Wait timeout in milliseconds. Default: 600000." })),
      pollIntervalMs: Type.Optional(Type.Number({ description: "Polling interval in milliseconds. Default: 2000." })),
      wait: Type.Optional(Type.Boolean({ description: "Wait for completion. Default: true." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = resolveCwd(params.cwd, ctx.cwd);
      const wait = params.wait ?? true;
      const timeoutMs = params.timeoutMs ?? 600000;
      const pollIntervalMs = params.pollIntervalMs ?? 2000;

      let parsed;
      try {
        parsed = parseAgentSelector(params.agent);
      } catch (err) {
        return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true, details: {} };
      }

      const scope = parsed.scope ?? params.agentScope ?? "user";
      const discovery = discoverAgents(cwd, scope);
      const agentName = parsed.agentName;
      if (!agentName) {
        return { content: [{ type: "text", text: `agent is required. Available agents:\n${formatAgentList(discovery.agents)}` }], isError: true, details: {} };
      }

      const agent = discovery.agents.find((a) => a.name === agentName);
      if (!agent) {
        return { content: [{ type: "text", text: `Agent "${agentName}" not found.\n\n${formatAgentList(discovery.agents)}` }], isError: true, details: {} };
      }

      const confirmProject = params.confirmProjectAgents ?? true;
      if (agent.source === "project" && confirmProject) {
        if (!ctx.hasUI) {
          return { content: [{ type: "text", text: `Agent "${agent.name}" is project-level. Pass confirmProjectAgents: false without UI.` }], isError: true, details: {} };
        }
        const confirmed = await ctx.ui.confirm("Project Agent Confirmation", `Agent "${agent.name}" is project-level:\n${agent.filePath}\n\nContinue?`);
        if (!confirmed) return { content: [{ type: "text", text: `Cancelled: project agent "${agent.name}" not confirmed.` }], details: { cancelled: true } };
      }

      const run = await createRun({
        cwd,
        agent: agent.name,
        source: agent.source,
        task: params.task,
        context: params.context,
        instructions: buildInstructions("(filled after creation)"),
      });

      const childTask = `You are running in a handoff run directory:\n${run.paths.runDir}\n\nRead instructions.md and complete the run protocol now.`;

      const spawn = await spawnAgent(backend, {
        agent,
        task: childTask,
        cwd,
        name: params.name ?? `handoff-${agent.name}`,
        target: normalizeTarget(params.target),
      }, signal);

      if (spawn.id) await updateManifestPaneId(run.paths.manifestPath, spawn.id);

      if (!wait) {
        return {
          content: [{ type: "text", text: `Started handoff run ${run.runId} for agent "${agent.name}".` }],
          details: { runId: run.runId, runDir: run.paths.runDir, paneId: spawn.id, status: "pending" },
        };
      }

      const done = await waitForCompletion(run.paths.statusPath, run.paths.resultPath, timeoutMs, pollIntervalMs, signal);
      if (done.outcome === "done") {
        return {
          content: [{ type: "text", text: done.result.trim() || "(result.md is empty)" }],
          details: { runId: run.runId, runDir: run.paths.runDir, paneId: spawn.id, status: done.status },
        };
      }

      return {
        content: [{ type: "text", text: `Handoff run ${run.runId} ended with ${done.outcome}. Child may still be running. Latest status: ${done.status?.status ?? "unknown"}.` }],
        details: { runId: run.runId, runDir: run.paths.runDir, paneId: spawn.id, outcome: done.outcome, status: done.status, partialResult: done.result },
      };
    },
  });
}
