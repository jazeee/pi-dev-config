import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Mirrors the states the worktree-dashboard understands. */
type SessionState = "idle" | "working" | "waiting" | "ended";

const STATE_FILE_NAME = ".claude-session-state";

let currentState: SessionState = "idle";

function worktreeRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function record(state: SessionState, ctx: ExtensionContext): void {
  currentState = state;
  const cwd = ctx.sessionManager.getCwd();
  const root = worktreeRoot(cwd);
  if (!root) return;
  const lines = [
    `id=${ctx.sessionManager.getSessionId()}`,
    `state=${state}`,
    `name=${ctx.sessionManager.getSessionName() ?? ""}`,
    `updated=${Math.floor(Date.now() / 1000)}`,
    `cwd=${cwd}`,
  ];
  try {
    writeFileSync(join(root, STATE_FILE_NAME), `${lines.join("\n")}\n`);
  } catch {
    // the dashboard tolerates a missing/stale file; never break the session over it
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => record("idle", ctx));
  pi.on("session_info_changed", (_event, ctx) => record(currentState, ctx));
  pi.on("input", (_event, ctx) => {
    record("working", ctx);
  });
  pi.on("before_agent_start", (_event, ctx) => {
    record("working", ctx);
  });
  pi.on("turn_end", (_event, ctx) => record("working", ctx));
  pi.on("tool_execution_end", (_event, ctx) => record("working", ctx));
  pi.on("agent_settled", (_event, ctx) => record("idle", ctx));
  pi.on("session_shutdown", (_event, ctx) => record("ended", ctx));
}
