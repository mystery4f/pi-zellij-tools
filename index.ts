import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const Direction = StringEnum(["right", "down"] as const, {
	description: "Direction for the new Zellij pane. If omitted, Zellij chooses the largest available space.",
});

const ThinkingLevel = StringEnum(["off", "minimal", "low", "medium", "high", "xhigh"] as const, {
	description: "Thinking level passed to pi via --thinking.",
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "zellij_spawn_pi",
		label: "Zellij Spawn Pi",
		description:
			"Create a new Zellij pane running an independent interactive pi process. Requires the current pi process to be running inside Zellij.",
		promptSnippet: "Create a new Zellij pane running an independent observable pi process",
		promptGuidelines: [
			"Use zellij_spawn_pi only when the user explicitly asks to start an independent observable pi process in Zellij.",
			"zellij_spawn_pi starts an interactive child pi process and does not wait for it to finish.",
		],
		parameters: Type.Object({
			prompt: Type.Optional(Type.String({ description: "Initial prompt passed to the child pi process." })),
			cwd: Type.Optional(Type.String({ description: "Working directory for the child pi process. Defaults to current cwd." })),
			name: Type.Optional(Type.String({ description: "Name for the new Zellij pane. Defaults to pi-child." })),
			direction: Type.Optional(Direction),
			floating: Type.Optional(Type.Boolean({ description: "Open the child pi pane as a floating pane." })),
			model: Type.Optional(Type.String({ description: "Model pattern or ID passed to pi via --model." })),
			thinkingLevel: Type.Optional(ThinkingLevel),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!process.env.ZELLIJ_SESSION_NAME && !process.env.ZELLIJ_PANE_ID) {
				throw new Error("zellij_spawn_pi requires pi to be running inside Zellij.");
			}
			if (params.floating && params.direction) {
				throw new Error(
					`"floating" and "direction" are mutually exclusive. Use "floating" for a floating pane, or "direction" for a tiled pane, not both.`,
				);
			}

			const cwd = params.cwd ?? ctx.cwd;
			const name = params.name ?? "pi-child";

			const args = ["action", "new-pane", "--cwd", cwd, "--name", name];
			if (params.floating) {
				args.push("--floating");
			} else if (params.direction) {
				args.push("--direction", params.direction);
			}

			args.push("--", "pi");

			const model = params.model?.trim();
			if (model) args.push("--model", model);
			if (params.thinkingLevel) args.push("--thinking", params.thinkingLevel);

			const prompt = params.prompt?.trim();
			if (prompt) {
				// pi does not currently treat "--" as an end-of-options marker, so keep option-like prompts positional.
				args.push(prompt.startsWith("-") ? `\n${prompt}` : prompt);
			}

			const result = await pi.exec("zellij", args, { signal, timeout: 10_000 });
			if (result.code !== 0) {
				const reason = result.killed
					? "zellij process was killed (possibly timed out)"
					: result.stderr || result.stdout || `exit code ${result.code}`;
				throw new Error(`zellij failed: ${reason}`);
			}

			const stdout = result.stdout.trim();
			const paneId = stdout.match(/\w+_\d+/)?.[0] || null;

			return {
				content: [
					{
						type: "text",
						text: paneId
							? `Created Zellij pane ${paneId} running independent pi in ${cwd}.`
							: `Created Zellij pane running independent pi in ${cwd}. (pane ID not captured from output: ${stdout || "(empty)"})`,
					},
				],
				details: { paneId, cwd, name, model, thinkingLevel: params.thinkingLevel, zellijStdout: stdout },
			};
		},
	});
}
