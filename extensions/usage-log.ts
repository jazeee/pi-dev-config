import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const run = promisify(execFile);

/** Only Vertex traffic is measured; other providers have no reporting prerequisites. */
const PROVIDER_ID = "notable-anthropic-vertex";
const LOG_NAME = "claude-code-usage";
const GCP_PROJECT = process.env.ANTHROPIC_VERTEX_PROJECT_ID ?? "vivaa-dev-backend";
const HEARTBEAT_INTERVAL_MS = 600_000;
const SEND_TIMEOUT_MS = 15_000;

let baselineHash: string | undefined;
let lastLogAtMs = 0;
let userEmail: string | undefined;

function debug(message: string): void {
  if (process.env.PI_HOOK_DEBUG !== "1") return;
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync(join(process.env.TMPDIR ?? tmpdir(), "pi-usage-hook.log"), line);
  } catch {
    // debug logging must never affect the session
  }
}

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["-C", cwd, ...args]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

interface UsageTotals {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  durationSeconds: number;
}

function collectUsage(ctx: ExtensionContext): UsageTotals {
  const totals: UsageTotals = {
    model: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    durationSeconds: 0,
  };
  const modelCounts = new Map<string, number>();
  let firstMs: number | undefined;
  let lastMs: number | undefined;

  for (const entry of ctx.sessionManager.getEntries()) {
    const entryMs = Date.parse(entry.timestamp);
    if (!Number.isNaN(entryMs)) {
      firstMs ??= entryMs;
      lastMs = entryMs;
    }
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role !== "assistant" || message.provider !== PROVIDER_ID) continue;

    modelCounts.set(message.model, (modelCounts.get(message.model) ?? 0) + 1);
    totals.inputTokens += message.usage?.input ?? 0;
    totals.outputTokens += message.usage?.output ?? 0;
    totals.cacheCreationInputTokens += message.usage?.cacheWrite ?? 0;
    totals.cacheReadInputTokens += message.usage?.cacheRead ?? 0;
  }

  const ranked = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (ranked) totals.model = ranked[0];
  if (firstMs !== undefined && lastMs !== undefined && lastMs >= firstMs) {
    totals.durationSeconds = Math.floor((lastMs - firstMs) / 1000);
  }
  return totals;
}

async function resolveUserEmail(): Promise<string> {
  if (userEmail) return userEmail;
  const { stdout } = await run("gcloud", [
    "auth",
    "list",
    "--filter=status:ACTIVE",
    "--format=value(account)",
  ]).catch(() => ({ stdout: "" }));
  userEmail = stdout.split("\n")[0]?.trim() || "unknown";
  return userEmail;
}

async function gitMetadata(cwd: string) {
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])) ?? "";
  const metadata = {
    git_branch: branch,
    git_commits: 0,
    git_files_changed: 0,
    git_insertions: 0,
    git_deletions: 0,
  };
  if (!baselineHash) return metadata;

  const commits = await git(cwd, ["rev-list", "--count", `${baselineHash}..HEAD`]);
  metadata.git_commits = Number.parseInt(commits ?? "0", 10) || 0;

  const shortstat = await git(cwd, ["diff", "--shortstat", baselineHash, "HEAD"]);
  if (shortstat) {
    metadata.git_files_changed = Number.parseInt(shortstat, 10) || 0;
    metadata.git_insertions = Number.parseInt(/(\d+) insertion/.exec(shortstat)?.[1] ?? "0", 10);
    metadata.git_deletions = Number.parseInt(/(\d+) deletion/.exec(shortstat)?.[1] ?? "0", 10);
  }
  return metadata;
}

async function writeCloudLog(payload: Record<string, unknown>): Promise<void> {
  // `gcloud logging write` must use ADC explicitly: an empty GOOGLE_APPLICATION_CREDENTIALS
  // means "ignore my service-account config", so `:-` semantics matter here.
  const adcFile =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    join(process.env.HOME ?? "", ".config/gcloud/application_default_credentials.json");
  const { stdout: token } = await run(
    "gcloud",
    ["auth", "application-default", "print-access-token"],
    { env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: adcFile } }
  );

  const dir = await mkdtemp(join(tmpdir(), "pi-usage-"));
  const tokenFile = join(dir, "token");
  try {
    await writeFile(tokenFile, token.trim(), { mode: 0o600 });
    await run(
      "gcloud",
      [
        "logging",
        "write",
        LOG_NAME,
        JSON.stringify(payload),
        `--project=${GCP_PROJECT}`,
        "--severity=INFO",
        `--access-token-file=${tokenFile}`,
        "--payload-type=json",
      ],
      { timeout: SEND_TIMEOUT_MS }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function report(eventType: "heartbeat" | "session_end", ctx: ExtensionContext): Promise<void> {
  const usage = collectUsage(ctx);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  if (totalTokens === 0) {
    debug(`no ${PROVIDER_ID} usage — skipping ${eventType}`);
    return;
  }

  const cwd = ctx.sessionManager.getCwd();
  const payload = {
    event_type: eventType,
    session_id: ctx.sessionManager.getSessionId(),
    user_email: await resolveUserEmail(),
    model: usage.model,
    region: process.env.CLOUD_ML_REGION ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us",
    project_id: GCP_PROJECT,
    duration_seconds: usage.durationSeconds,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_creation_input_tokens: usage.cacheCreationInputTokens,
    cache_read_input_tokens: usage.cacheReadInputTokens,
    total_tokens: totalTokens,
    agent: "pi",
    ...(await gitMetadata(cwd)),
  };

  debug(`sending ${eventType}: model=${usage.model} tokens=${totalTokens}`);
  await writeCloudLog(payload);
  lastLogAtMs = Date.now();
  debug(`${eventType} sent`);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    baselineHash = await git(ctx.sessionManager.getCwd(), ["rev-parse", "HEAD"]);
    lastLogAtMs = Date.now();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (Date.now() - lastLogAtMs < HEARTBEAT_INTERVAL_MS) return;
    lastLogAtMs = Date.now();
    void report("heartbeat", ctx).catch((error: unknown) => debug(`heartbeat failed: ${error}`));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await report("session_end", ctx).catch((error: unknown) => debug(`final flush failed: ${error}`));
  });
}
