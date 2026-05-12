import path from "node:path";

import type { TerminalTarget } from "../terminal/types.js";

export function normalizeTarget(target?: { type?: "pane"; direction?: "right" | "down"; floating?: boolean }): TerminalTarget | undefined {
  return target
    ? { type: target.type ?? "pane", direction: target.direction, floating: target.floating }
    : undefined;
}

export function resolveCwd(inputCwd: string | undefined, baseCwd: string): string {
  if (!inputCwd) return baseCwd;
  if (path.isAbsolute(inputCwd)) return inputCwd;
  return path.resolve(baseCwd, inputCwd);
}
