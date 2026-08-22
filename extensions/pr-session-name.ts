import { execFileSync } from "node:child_process";
import { isBashToolResult, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const PR_URL = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/;
const MAX_TITLE = 40;
const MAX_STATUS = 80;
const NAME_COLOR = "accent";

function prTitle(url: string, cwd: string): string | undefined {
  try {
    const out = execFileSync("gh", ["pr", "view", url, "--json", "title", "-q", ".title"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function shorten(title: string, max = MAX_TITLE): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

function branch(cwd: string): string | undefined {
  try {
    const name = execFileSync("git", ["-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  const showName = (ctx: ExtensionContext): void => {
    const name = pi.getSessionName();
    if (!ctx.hasUI) return;
    const label = name ? shorten(name, MAX_STATUS) : undefined;
    ctx.ui.setWidget(
      "session-name",
      label ? (_tui, theme) => new Text(theme.fg(NAME_COLOR, label), 0, 0) : undefined,
    );
  };

  pi.on("session_start", async (_event, ctx) => showName(ctx));
  pi.on("session_info_changed", async (_event, ctx) => showName(ctx));

  pi.on("before_agent_start", async (event, ctx) => {
    if (pi.getSessionName()) return;
    const first = (event.prompt ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (!first) return;
    const head = branch(ctx.sessionManager.getCwd());
    const name = head
      ? `${head}: ${shorten(first, Math.max(20, MAX_TITLE - head.length - 2))}`
      : shorten(first);
    pi.setSessionName(name);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!isBashToolResult(event) || event.isError) return;
    const command = String((event.input as { command?: string })?.command ?? "");
    if (!/\bgh\b[\s\S]*\bpr\b[\s\S]*\bcreate\b/.test(command)) return;

    const match = PR_URL.exec(
      typeof event.content === "string" ? event.content : JSON.stringify(event.content ?? ""),
    );
    if (!match) return;

    const [url, , , number] = match;
    const title = prTitle(url, ctx.sessionManager.getCwd());
    const name = title ? `#${number} ${shorten(title)}` : `#${number}`;
    pi.setSessionName(name);
    ctx.ui.notify(`Session named: ${name}`, "info");
  });
}
