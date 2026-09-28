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
import { useT } from "@/components/locale-provider";
import type { Translate, TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Per-tool presentation: label + icon shown while the tool runs.
 *
 * The record is keyed by the *server's* tool names, which are identifiers and
 * are never translated — only the label each one points at is. Lookups happen at
 * render time because the label depends on the active locale.
 */
const TOOL_META: Record<string, { labelKey: TranslationKey; icon: typeof Search }> = {
  searchListings: { labelKey: "agentUi.toolSearch", icon: Search },
  getListingDetail: { labelKey: "agentUi.toolGetListingDetail", icon: MapPinned },
  recommendListings: { labelKey: "agentUi.toolRecommendListings", icon: Sparkles },
  compareListings: { labelKey: "agentUi.toolCompareListings", icon: GitCompare },
  getUserWishlists: { labelKey: "agentUi.toolGetUserWishlists", icon: Heart },
  createWishlist: { labelKey: "agentUi.toolCreateWishlist", icon: Heart },
  addToWishlist: { labelKey: "agentUi.toolAddToWishlist", icon: Heart },
  removeFromWishlist: { labelKey: "agentUi.toolRemoveFromWishlist", icon: Trash2 },
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
function summarise(t: Translate, toolName: string, output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;

  if (record.ok === false) return null;

  switch (toolName) {
    case "searchListings":
      return t("agentUi.summarySearch", { count: Number(record.total ?? 0) });
    case "recommendListings":
      return t("agentUi.summaryRecommend", {
        count: (record.recommendations as unknown[] | undefined)?.length ?? 0,
      });
    case "compareListings":
      return t("agentUi.summaryCompare", {
        count: (record.compared as unknown[] | undefined)?.length ?? 0,
      });
    case "getListingDetail":
      return t("agentUi.summaryListingDetail");
    case "getUserWishlists":
      return t("agentUi.summaryWishlists", { count: Number(record.count ?? 0) });
    case "createWishlist": {
      const wishlist = record.wishlist as { name?: string } | undefined;
      return t("agentUi.summaryWishlistCreated", { name: wishlist?.name ?? t("nav.wishlist") });
    }
    case "addToWishlist":
      return t("agentUi.summaryWishlistAdded", {
        name: String(record.wishlistName ?? t("nav.wishlist")),
      });
    case "removeFromWishlist":
      return t("agentUi.summaryWishlistRemoved", {
        name: String(record.wishlistName ?? t("nav.wishlist")),
      });
    default:
      return t("agentUi.summaryDone");
  }
}

function ToolStep({ part }: { part: { type: string; [key: string]: unknown } }) {
  const t = useT();
  const toolName = getToolName(part as never);
  const meta = TOOL_META[toolName];
  // An unknown tool keeps its raw identifier as the label: it is a name, not prose.
  const Icon = meta?.icon ?? Sparkles;
  const label = meta ? t(meta.labelKey) : toolName;
  const state = String(part.state ?? "");
  const output = part.output;

  const running = state === "input-streaming" || state === "input-available";
  const errored = state === "output-error" || (output as { ok?: boolean } | undefined)?.ok === false;
  const done = state === "output-available";

  const errorText = errored
    ? String(
        (part.errorText as string | undefined) ??
          (output as { error?: string } | undefined)?.error ??
          t("agentUi.toolError"),
      )
    : null;

  const summary = done ? summarise(t, toolName, output) : null;
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
        <Icon className="size-3.5 shrink-0 opacity-70" />
        <span className="font-medium">
          {running
            ? t("agentUi.toolRunning", { label })
            : errored
              ? t("agentUi.toolFailed", { label })
              : (summary ?? label)}
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
  const t = useT();

  return (
    <p className="text-muted-foreground px-1 text-[11px]">
      {t("agent.loginHint")}
      <Link href="/login" className="text-primary hover:underline">
        {t("agentUi.loginLink")}
      </Link>
    </p>
  );
}
