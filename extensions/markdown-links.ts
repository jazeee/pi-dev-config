import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const FENCE = /^\s*(```|~~~)/;
const INLINE_LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^()\s]+)>?(?:\s+"[^"]*")?\s*\)/g;

/** Renders link text as plain prose and the href as an autolink, which pi styles as a link. */
function flattenLinks(line: string): string {
  return line.replace(INLINE_LINK, (match, bang: string, text: string, href: string) => {
    if (bang) return match;
    if (!text.trim()) return `<${href}>`;
    if (text === href) return `<${href}>`;
    return `${text} <${href}>`;
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerMarkdownTransformer((markdown) => {
    let inFence = false;
    return markdown
      .split("\n")
      .map((line) => {
        if (FENCE.test(line)) {
          inFence = !inFence;
          return line;
        }
        return inFence ? line : flattenLinks(line);
      })
      .join("\n");
  });
}
