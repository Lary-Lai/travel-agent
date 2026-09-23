/**
 * Tiny Markdown subset parser for Agent replies.
 *
 * Pure logic (no React) so it can be unit-tested: the model writes `**bold**`,
 * `- bullets` and `1.` lists, and those asterisks used to reach the user
 * literally. The React component maps these tokens to elements.
 *
 * Only the subset the model actually produces is supported, and no HTML is ever
 * parsed or emitted.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; value: string; href: string };

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; lines: string[] };

/** `**bold**` | `*italic*` | `` `code` `` | `[text](https://url)` */
const INLINE_PATTERN =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;

/** Split a line into formatting tokens. Adjacent plain text is merged. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  INLINE_PATTERN.lastIndex = 0;

  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.value += value;
    else tokens.push({ type: "text", value });
  };

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    const [full, bold, boldText, italic, italicText, code, codeText, , linkText, linkHref] = match;

    pushText(text.slice(cursor, match.index));
    cursor = match.index + full.length;

    if (bold) tokens.push({ type: "bold", value: boldText });
    else if (italic) tokens.push({ type: "italic", value: italicText });
    else if (code) tokens.push({ type: "code", value: codeText });
    else if (linkText && linkHref) tokens.push({ type: "link", value: linkText, href: linkHref });
  }

  pushText(text.slice(cursor));
  return tokens;
}

/**
 * Parse text into block-level structures.
 *
 * A leading `**` is bold, not a bullet: bullet syntax requires the marker to be
 * followed by whitespace, so `**Title**` on its own line stays a paragraph.
 */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let list: Extract<MarkdownBlock, { kind: "list" }> | null = null;
  let paragraph: Extract<MarkdownBlock, { kind: "paragraph" }> | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      list = null;
      paragraph = null;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line.trim());
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      list = null;
      paragraph = null;
      continue;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      if (!list || list.ordered) {
        list = { kind: "list", ordered: false, items: [] };
        blocks.push(list);
      }
      list.items.push(bullet[1]);
      paragraph = null;
      continue;
    }

    const ordered = /^(\d{1,2})[.、)]\s+(.*)$/.exec(line.trim());
    if (ordered) {
      if (!list || !list.ordered) {
        list = { kind: "list", ordered: true, items: [] };
        blocks.push(list);
      }
      list.items.push(ordered[2]);
      paragraph = null;
      continue;
    }

    if (paragraph) {
      paragraph.lines.push(line);
    } else {
      paragraph = { kind: "paragraph", lines: [line] };
      blocks.push(paragraph);
    }
    list = null;
  }

  return blocks;
}

/** Plain text with all Markdown markers removed (useful for tests/previews). */
export function stripMarkdown(text: string): string {
  return parseMarkdown(text)
    .map((block) => {
      if (block.kind === "heading") return block.text;
      if (block.kind === "list") return block.items.join("\n");
      return block.lines.join("\n");
    })
    .join("\n")
    .replace(/\*\*|\*|`/g, "");
}
