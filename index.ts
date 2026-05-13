import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ZellijTerminalBackend } from "./src/terminal/zellij.js";
import { registerRunShellTool } from "./src/tools/run-shell.js";
import { registerSpawnPiTool } from "./src/tools/spawn-pi.js";
import { registerSpawnAgentTool } from "./src/tools/spawn-agent.js";

export default function (pi: ExtensionAPI) {
  const backend = new ZellijTerminalBackend((command, args, options) => pi.exec(command, args, options));

  registerRunShellTool(pi, backend);
  registerSpawnPiTool(pi, backend);
  registerSpawnAgentTool(pi, backend);
}
