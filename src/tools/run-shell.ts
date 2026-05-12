import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { runShell } from "../terminal/actions.js";
import type { TerminalBackend } from "../terminal/types.js";
import { resolveCwd, normalizeTarget } from "./common.js";
import { TargetSchema } from "./schemas.js";

export function registerRunShellTool(pi: ExtensionAPI, backend: TerminalBackend): void {
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
      target: Type.Optional(TargetSchema),
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
}
