import fs from "node:fs/promises";

import { AgentRunPaths, RunManifest, RunStatus, createRunId, getRunPaths } from "./protocol.js";

export interface CreateRunOptions {
  cwd: string;
  agent?: string;
  source?: "user" | "project";
  task: string;
  context?: string;
  instructions: string;
}

export async function createRun(options: CreateRunOptions): Promise<{ runId: string; paths: AgentRunPaths; manifest: RunManifest }> {
  const runId = createRunId();
  const paths = getRunPaths(options.cwd, runId);

  await fs.mkdir(paths.artifactsDir, { recursive: true });

  const manifest: RunManifest = {
    protocolVersion: "1",
    runId,
    agent: options.agent,
    source: options.source,
    cwd: options.cwd,
    runDir: paths.runDir,
    createdAt: new Date().toISOString(),
  };

  const status: RunStatus = {
    status: "pending",
    updatedAt: new Date().toISOString(),
    message: "created",
  };

  await Promise.all([
    fs.writeFile(paths.manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"),
    fs.writeFile(paths.taskPath, options.task.trim() + "\n", "utf8"),
    fs.writeFile(paths.contextPath, (options.context?.trim() || "(no extra context)") + "\n", "utf8"),
    fs.writeFile(paths.instructionsPath, options.instructions.trim() + "\n", "utf8"),
    fs.writeFile(paths.statusPath, JSON.stringify(status, null, 2) + "\n", "utf8"),
    fs.writeFile(paths.resultPath, "", "utf8"),
    fs.writeFile(paths.inboxPath, "", "utf8"),
    fs.writeFile(paths.notesPath, "", "utf8"),
  ]);

  return { runId, paths, manifest };
}

export async function updateManifestPaneId(manifestPath: string, paneId: string): Promise<void> {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as RunManifest;
    manifest.paneId = paneId;
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } catch {
    // best-effort only
  }
}

export async function readStatus(statusPath: string): Promise<RunStatus | null> {
  try {
    const raw = await fs.readFile(statusPath, "utf8");
    return JSON.parse(raw) as RunStatus;
  } catch {
    return null;
  }
}

export async function readResult(resultPath: string): Promise<string> {
  try {
    return await fs.readFile(resultPath, "utf8");
  } catch {
    return "";
  }
}

export async function waitForCompletion(
  statusPath: string,
  resultPath: string,
  timeoutMs: number,
  pollIntervalMs: number,
  signal?: AbortSignal,
): Promise<{ outcome: "done" | "blocked" | "error" | "timeout" | "aborted"; status: RunStatus | null; result: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return { outcome: "aborted", status: await readStatus(statusPath), result: await readResult(resultPath) };
    }

    const status = await readStatus(statusPath);
    if (status?.status === "done") {
      return { outcome: "done", status, result: await readResult(resultPath) };
    }
    if (status?.status === "blocked") {
      return { outcome: "blocked", status, result: await readResult(resultPath) };
    }
    if (status?.status === "error") {
      return { outcome: "error", status, result: await readResult(resultPath) };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return { outcome: "timeout", status: await readStatus(statusPath), result: await readResult(resultPath) };
}
