import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { spawnPi } from "../terminal/actions.js";
import type { TerminalBackend } from "../terminal/types.js";
import { resolveCwd, normalizeTarget } from "./common.js";
import { TargetSchema, ThinkingLevelSchema } from "./schemas.js";

export function registerSpawnPiTool(pi: ExtensionAPI, backend: TerminalBackend): void {
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
      target: Type.Optional(TargetSchema),
      model: Type.Optional(Type.String({ description: "Model pattern or ID passed to pi via --model." })),
      thinkingLevel: Type.Optional(ThinkingLevelSchema),
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
