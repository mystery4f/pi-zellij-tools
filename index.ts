import path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ZellijTerminalBackend } from "./src/terminal/zellij.js";
import { runShell, spawnPi } from "./src/terminal/actions.js";
import type { TerminalTarget } from "./src/terminal/types.js";

const TerminalDirection = StringEnum(["right", "down"] as const, {
  description: "Direction for the new pane. If omitted, the terminal chooses the largest available space.",
});

const ThinkingLevel = StringEnum(["off", "minimal", "low", "medium", "high", "xhigh"] as const, {
  description: "Thinking level passed to pi via --thinking.",
});

const Target = Type.Object({
  type: Type.Optional(StringEnum(["pane"] as const, { description: 'Target type. Currently only "pane" is supported.' })),
  direction: Type.Optional(TerminalDirection),
  floating: Type.Optional(Type.Boolean({ description: "Open as a floating pane. Mutually exclusive with direction." })),
}, { description: "Terminal target configuration. Defaults to a tiled pane." });

function normalizeTarget(target?: { type?: "pane"; direction?: "right" | "down"; floating?: boolean }): TerminalTarget | undefined {
  return target
    ? { type: target.type ?? "pane", direction: target.direction, floating: target.floating }
    : undefined;
}

function resolveCwd(inputCwd: string | undefined, baseCwd: string): string {
  if (!inputCwd) return baseCwd;
  if (path.isAbsolute(inputCwd)) return inputCwd;
  return path.resolve(baseCwd, inputCwd);
}

export default function (pi: ExtensionAPI) {
  const backend = new ZellijTerminalBackend((command, args, options) => pi.exec(command, args, options));

  pi.registerTool({
    name: "run_shell",
    label: "Run Shell Command",
    description: "Run a shell command in a new terminal target.",
    promptSnippet: "Run a shell command in a separate visible terminal",
    promptGuidelines: [
      "Use run_shell only when the user asks for a separate visible terminal.",
      "For normal checks, use the regular bash tool instead of run_shell.",
    ],
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to execute." }),
      cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to current cwd." })),
      name: Type.Optional(Type.String({ description: "Name for the terminal target. Defaults to shell-command." })),
      target: Type.Optional(Target),
      shell: Type.Optional(Type.String({ description: 'Shell to use. Defaults to "sh". Use "bash" for Bash features.' })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runShell(backend, {
        command: params.command,
        cwd: resolveCwd(params.cwd, ctx.cwd),
        name: params.name,
        shell: params.shell,
        target: normalizeTarget(params.target),
      }, signal);

      return {
        content: [
          {
            type: "text",
            text: `Created terminal target "${result.name}" running shell command in ${result.cwd}. (stdout: ${result.stdout || "(empty)"})`,
          },
        ],
        details: { id: result.id, cwd: result.cwd, name: result.name, stdout: result.stdout },
      };
    },
  });

  pi.registerTool({
    name: "spawn_pi",
    label: "Spawn Pi",
    description: "Start an independent pi session in a new terminal target.",
    promptSnippet: "Start an independent pi session in a separate visible terminal",
    promptGuidelines: [
      "Use spawn_pi only when the user asks for a separate observable Pi session.",
      "Do not wait for the child Pi started by spawn_pi to finish.",
    ],
    parameters: Type.Object({
      prompt: Type.Optional(Type.String({ description: "Initial prompt passed to the child pi process." })),
      cwd: Type.Optional(Type.String({ description: "Working directory. Defaults to current cwd." })),
      name: Type.Optional(Type.String({ description: "Name for the terminal target. Defaults to pi-child." })),
      target: Type.Optional(Target),
      model: Type.Optional(Type.String({ description: "Model pattern or ID passed to pi via --model." })),
      thinkingLevel: Type.Optional(ThinkingLevel),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await spawnPi(backend, {
        prompt: params.prompt,
        cwd: resolveCwd(params.cwd, ctx.cwd),
        name: params.name,
        target: normalizeTarget(params.target),
        model: params.model,
        thinkingLevel: params.thinkingLevel,
      }, signal);

      return {
        content: [
          {
            type: "text",
            text: result.id
              ? `Created terminal target "${result.name}" (${result.id}) running pi in ${result.cwd}.`
              : `Created terminal target "${result.name}" running pi in ${result.cwd}. (ID not captured from output: ${result.stdout || "(empty)"})`,
          },
        ],
        details: { id: result.id, cwd: result.cwd, name: result.name, model: result.model, thinkingLevel: result.thinkingLevel, stdout: result.stdout },
      };
    },
  });
}
