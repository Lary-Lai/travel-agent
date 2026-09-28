"use client";

import {
  AlertTriangle,
  FileText,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAgent } from "@/components/agent-provider";
import { AgentMessage } from "@/components/agent-message";
import { useT } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore } from "@/lib/store";

/**
 * Starter prompts, as translation keys. The four demo prompts already live in the
 * main dictionary (`agent.example*Prompt`), so only the extra one has a key here.
 * A suggestion is sent verbatim, so translating it also translates the question
 * the model actually answers.
 */
const SUGGESTIONS = [
  "agent.exampleSearchPrompt",
  "agent.exampleRecommendPrompt",
  "agent.exampleComparePrompt",
  "agent.exampleWishlistPrompt",
  "agentUi.suggestionWishlists",
] as const;

export function AgentChat() {
  const t = useT();
  const { user } = useSession();
  const { messages, status, busy, error, send, stop, clear, retryLast, agentStatus, notConfigured } =
    useAgent();
  const setOpen = useAgentStore((state) => state.setOpen);

  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  const submit = () => {
    if (!input.trim()) return;
    send(input);
    setInput("");
  };

  const handleUpload = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      toast.error(t("agentUi.uploadTypeError"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t("agentUi.uploadSizeError"));
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/agent/upload", { method: "POST", body: formData });
      const payload = await response.json();

      if (!payload.ok) {
        toast.error(payload.error?.message ?? t("agentUi.parseFailed"));
        return;
      }

      const { plan, textLength } = payload.data as {
        plan: {
          destination: string | null;
          days: number | null;
          guests: number | null;
          budgetPerNight: number | null;
          places: string[];
          summary: string;
        };
        textLength: number;
      };

      toast.success(t("agentUi.parseSuccess", { count: textLength }));

      // Hand the structured plan back to the Agent to continue the workflow.
      // The tool name stays literal — it is an identifier, not a sentence.
      const prompt = [
        t("agentUi.uploadPromptIntro"),
        t("agentUi.uploadPromptDestination", {
          value: plan.destination ?? t("agentUi.planUnknownDestination"),
        }),
        plan.days ? t("agentUi.uploadPromptDays", { count: plan.days }) : null,
        plan.guests ? t("agentUi.uploadPromptGuests", { count: plan.guests }) : null,
        plan.budgetPerNight
          ? t("agentUi.uploadPromptBudget", { amount: plan.budgetPerNight })
          : null,
        plan.places.length > 0
          ? t("agentUi.uploadPromptPlaces", {
              places: plan.places.join(t("agentUi.placesSeparator")),
            })
          : null,
        plan.summary ? t("agentUi.uploadPromptSummary", { summary: plan.summary }) : null,
        t("agentUi.uploadPromptAsk"),
      ]
        .filter(Boolean)
        .join("\n");

      send(prompt);
    } catch {
      toast.error(t("agentUi.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ------------------------------------------------------------ header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t("agent.title")}</p>
            <p className="text-muted-foreground text-[11px]">
              {notConfigured
                ? t("agentUi.modelUnknown")
                : t("agentUi.modelLabel", { name: agentStatus?.model ?? "…" })}
            </p>
          </div>
        </div>

        {/* Header actions. The Sheet's own ✕ is disabled (see agent-drawer), so
            both controls live here in one row and never overlap. */}
        <div className="flex shrink-0 items-center gap-0.5">
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-1.5 text-xs"
              onClick={clear}
              disabled={busy}
            >
              <Trash2 className="size-3.5" />
              {t("agent.clear")}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
            aria-label={t("agentUi.closeAssistant")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {notConfigured ? (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 border-b px-4 py-2.5 text-[11px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t("agentUi.modelMissing", {
              problem: agentStatus?.problem ?? t("agentUi.modelMissingHint"),
            })}
          </span>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-2xl p-4">
              <p className="text-sm font-medium">{t("agentUi.greeting")}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {t("agentUi.greetingBody")}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground px-1 text-[11px] font-medium">
                {t("agentUi.tryThese")}
              </p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(t(suggestion))}
                  disabled={busy}
                  className="hover:border-primary/40 hover:bg-accent/50 w-full rounded-xl border px-3 py-2.5 text-left text-xs transition-colors disabled:opacity-60"
                >
                  {t(suggestion)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <AgentMessage key={message.id} message={message} />)
        )}

        {status === "submitted" ? (
          <div className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            {t("agent.thinking")}
          </div>
        ) : null}

        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{t("agentUi.requestFailed")}</p>
              <p className="mt-0.5 leading-relaxed">{error.message}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------- input */}
      <div className="space-y-2 border-t px-4 py-3">
        {!user ? (
          <p className="text-muted-foreground text-[11px]">{t("agentUi.guestHint")}</p>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t("agent.placeholder")}
            rows={2}
            disabled={busy}
            className="min-h-11 resize-none text-sm"
          />

          {busy ? (
            <Button
              size="icon"
              variant="outline"
              onClick={stop}
              aria-label={t("agentUi.stopGenerating")}
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={submit}
              disabled={!input.trim()}
              aria-label={t("agent.send")}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf,image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 text-[11px]"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || uploading}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileText className="size-3.5" />
            )}
            {uploading ? t("agentUi.parsing") : t("agentUi.uploadPlan")}
          </Button>

          {error ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-1.5 text-[11px]"
              onClick={retryLast}
            >
              <RotateCcw className="size-3.5" />
              {t("agentUi.retry")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
