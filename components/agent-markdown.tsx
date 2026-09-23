"use client";

import type { ReactNode } from "react";

import { parseMarkdown, tokenizeInline, type MarkdownBlock } from "@/lib/agent-markdown";

/**
 * Renders the Agent's Markdown subset.
 *
 * Block and inline parsing live in `lib/agent-markdown.ts` (pure and unit
 * tested); this file only maps tokens to elements. It never uses
 * `dangerouslySetInnerHTML`, so model output cannot inject markup.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (token.type) {
      case "bold":
        return (
          <strong key={key} className="text-foreground font-semibold">
            {token.value}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {token.value}
          </em>
        );
      case "code":
        return (
          <code key={key} className="bg-background/70 rounded px-1 py-0.5 font-mono text-[0.85em]">
            {token.value}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {token.value}
          </a>
        );
      default:
        return <span key={key}>{token.value}</span>;
    }
  });
}

function Block({ block, index }: { block: MarkdownBlock; index: number }) {
  if (block.kind === "heading") {
    return (
      <p
        className={
          block.level <= 2
            ? "border-primary text-foreground mt-3 mb-1 border-l-2 pl-2 text-sm font-semibold first:mt-0"
            : "text-foreground mt-3 mb-1 text-sm font-semibold first:mt-0"
        }
      >
        {renderInline(block.text, `h${index}`)}
      </p>
    );
  }

  if (block.kind === "list") {
    return (
      <ul className="my-1.5 space-y-1.5">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} className="flex gap-2">
            {block.ordered ? (
              <span
                aria-hidden
                className="bg-primary/12 text-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums"
              >
                {itemIndex + 1}
              </span>
            ) : (
              <span
                aria-hidden
                className="bg-primary/70 mt-[0.4rem] size-1.5 shrink-0 rounded-full"
              />
            )}
            <span className="min-w-0 flex-1">
              {renderInline(item, `l${index}-${itemIndex}`)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="my-1.5 first:mt-0 last:mb-0">
      {renderInline(block.lines.join("\n"), `p${index}`)}
    </p>
  );
}

export function AgentMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} index={index} />
      ))}
    </div>
  );
}
