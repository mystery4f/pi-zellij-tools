import path from "node:path";

export type RunStatusType = "pending" | "running" | "done" | "blocked" | "error";

export interface RunStatus {
  status: RunStatusType;
  updatedAt: string;
  message: string;
}

export interface RunManifest {
  protocolVersion: string;
  runId: string;
  agent?: string;
  source?: "user" | "project";
  cwd: string;
  runDir: string;
  createdAt: string;
  paneId?: string;
}

export interface AgentRunPaths {
  rootDir: string;
  runDir: string;
  manifestPath: string;
  taskPath: string;
  contextPath: string;
  instructionsPath: string;
  statusPath: string;
  resultPath: string;
  inboxPath: string;
  notesPath: string;
  artifactsDir: string;
}

export function createRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getRunPaths(cwd: string, runId: string): AgentRunPaths {
  const rootDir = path.join(cwd, ".pi", "agent-runs");
  const runDir = path.join(rootDir, runId);

  return {
    rootDir,
    runDir,
    manifestPath: path.join(runDir, "manifest.json"),
    taskPath: path.join(runDir, "task.md"),
    contextPath: path.join(runDir, "context.md"),
    instructionsPath: path.join(runDir, "instructions.md"),
    statusPath: path.join(runDir, "status.json"),
    resultPath: path.join(runDir, "result.md"),
    inboxPath: path.join(runDir, "inbox.md"),
    notesPath: path.join(runDir, "notes.md"),
    artifactsDir: path.join(runDir, "artifacts"),
  };
}
