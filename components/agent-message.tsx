"use client";

import { getToolName, isTextUIPart, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import {
  AlertTriangle,
  Check,
  GitCompare,
  Heart,
  Loader2,
  MapPinned,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import { AgentListingCard, type AgentListing } from "@/components/agent-listing-card";
import { AgentMarkdown } from "@/components/agent-markdown";
import { cn } from "@/lib/utils";

/** Per-tool presentation: label + icon shown while the tool runs. */
const TOOL_META: Record<string, { label: string; icon: typeof Search }> = {
  searchListings: { label: "搜索房源", icon: Search },
  getListingDetail: { label: "读取房源详情", icon: MapPinned },
  recommendListings: { label: "生成推荐", icon: Sparkles },
  compareListings: { label: "对比房源", icon: GitCompare },
  getUserWishlists: { label: "读取心愿单", icon: Heart },
  createWishlist: { label: "创建心愿单", icon: Heart },
  addToWishlist: { label: "加入心愿单", icon: Heart },
  removeFromWishlist: { label: "移出心愿单", icon: Trash2 },
};

/** Pull listing cards out of whichever shape the tool returned. */
function extractListings(output: unknown): AgentListing[] {
  if (!output || typeof output !== "object") return [];
  const record = output as Record<string, unknown>;

  if (Array.isArray(record.listings)) return record.listings as AgentListing[];
  if (Array.isArray(record.recommendations)) return record.recommendations as AgentListing[];
  if (Array.isArray(record.compared)) return record.compared as AgentListing[];
  if (record.listing && typeof record.listing === "object") {
    return [record.listing as AgentListing];
  }
  return [];
}

/** Human-readable success summary for a finished tool call. */
function summarise(toolName: string, output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;

  if (record.ok === false) return null;

  switch (toolName) {
    case "searchListings":
      return `找到 ${record.total ?? 0} 个房源`;
    case "recommendListings":
      return `生成 ${(record.recommendations as unknown[] | undefined)?.length ?? 0} 个推荐`;
    case "compareListings":
      return `对比了 ${(record.compared as unknown[] | undefined)?.length ?? 0} 个房源`;
    case "getListingDetail":
      return "已读取房源详情";
    case "getUserWishlists":
      return `读取到 ${record.count ?? 0} 个心愿单`;
    case "createWishlist": {
      const wishlist = record.wishlist as { name?: string } | undefined;
      return `已创建「${wishlist?.name ?? "心愿单"}」`;
    }
    case "addToWishlist":
      return `已加入「${record.wishlistName ?? "心愿单"}」`;
    case "removeFromWishlist":
      return `已从「${record.wishlistName ?? "心愿单"}」移除`;
    default:
      return "已完成";
  }
}

function ToolStep({ part }: { part: { type: string; [key: string]: unknown } }) {
  const toolName = getToolName(part as never);
  const meta = TOOL_META[toolName] ?? { label: toolName, icon: Sparkles };
  const state = String(part.state ?? "");
  const output = part.output;

  const running = state === "input-streaming" || state === "input-available";
  const errored = state === "output-error" || (output as { ok?: boolean } | undefined)?.ok === false;
  const done = state === "output-available";

  const errorText = errored
    ? String(
        (part.errorText as string | undefined) ??
          (output as { error?: string } | undefined)?.error ??
          "工具执行失败",
      )
    : null;

  const summary = done ? summarise(toolName, output) : null;
  const listings = done && !errored ? extractListings(output).slice(0, 6) : [];

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]",
          errored
            ? "bg-destructive/10 text-destructive"
            : done
              ? "bg-muted text-muted-foreground"
              : "bg-muted text-muted-foreground",
        )}
      >
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : errored ? (
          <AlertTriangle className="size-3.5 shrink-0" />
        ) : (
          <Check className="size-3.5 shrink-0" />
        )}
        <meta.icon className="size-3.5 shrink-0 opacity-70" />
        <span className="font-medium">
          {running ? `正在${meta.label}…` : errored ? `${meta.label}失败` : (summary ?? meta.label)}
        </span>
      </div>

      {errorText ? (
        <p className="text-destructive px-2.5 text-[11px] leading-relaxed">{errorText}</p>
      ) : null}

      {listings.length > 0 ? (
        <div className="space-y-2">
          {listings.map((listing, index) => (
            <AgentListingCard key={`${listing.id}-${index}`} listing={listing} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AgentMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {message.parts.map((part, index) => {
        if (isTextUIPart(part)) {
          if (!part.text.trim()) return null;

          // The model writes Markdown; render it for assistant replies so the
          // raw **asterisks** never reach the user. User text stays literal.
          if (!isUser) {
            return (
              <div
                key={index}
                className="bg-muted max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
              >
                <AgentMarkdown text={part.text} />
              </div>
            );
          }

          return (
            <div
              key={index}
              className="bg-primary text-primary-foreground max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
            >
              {part.text}
            </div>
          );
        }

        if (isToolUIPart(part)) {
          return (
            <div key={index} className="w-full">
              <ToolStep part={part as { type: string; [key: string]: unknown }} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

/** Shown when the visitor has not logged in but tries a wishlist action. */
export function AgentLoginHint() {
  return (
    <p className="text-muted-foreground px-1 text-[11px]">
      需要登录后才能使用收藏相关功能，
      <Link href="/login" className="text-primary hover:underline">
        去登录
      </Link>
    </p>
  );
}
