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
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentStore } from "@/lib/store";

const SUGGESTIONS = [
  "国庆想去东京玩 5 天，4 个人，每晚预算 800 元左右，希望离地铁近一点。",
  "我和三个朋友去东京，预算每晚 800 元，希望交通方便，帮我选三个。",
  "帮我比较刚才这几个房源，哪个更适合四个人？",
  "把刚才推荐的第一个房源加入「东京旅行」心愿单。",
  "看看我的心愿单里都有什么。",
];

export function AgentChat() {
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
      toast.error("请上传 PDF 或图片（JPG / PNG / WebP）格式的旅行计划");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("文件过大，请上传 8MB 以内的文件");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/agent/upload", { method: "POST", body: formData });
      const payload = await response.json();

      if (!payload.ok) {
        toast.error(payload.error?.message ?? "PDF 解析失败");
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

      toast.success(`已解析旅行计划（提取 ${textLength} 个字符）`);

      // Hand the structured plan back to the Agent to continue the workflow.
      const prompt = [
        "我上传了一份旅行计划，已解析出以下信息，请据此帮我推荐住宿：",
        `- 目的地：${plan.destination ?? "未识别"}`,
        plan.days ? `- 天数：${plan.days} 天` : null,
        plan.guests ? `- 人数：${plan.guests} 人` : null,
        plan.budgetPerNight ? `- 每晚预算：约 ${plan.budgetPerNight} 元` : null,
        plan.places.length > 0 ? `- 计划中的地点：${plan.places.join("、")}` : null,
        plan.summary ? `- 概述：${plan.summary}` : null,
        "请先调用 recommendListings 推荐 3 个合适的房源。",
      ]
        .filter(Boolean)
        .join("\n");

      send(prompt);
    } catch {
      toast.error("PDF 上传失败，请重试");
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
            <p className="text-sm font-semibold">AI 旅行助手</p>
            <p className="text-muted-foreground text-[11px]">
              {notConfigured ? "未配置模型" : `模型 ${agentStatus?.model ?? "…"}`}
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
              清空
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
            aria-label="关闭助手"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {notConfigured ? (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 border-b px-4 py-2.5 text-[11px] leading-relaxed">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>尚未配置可用的 AI 模型：{agentStatus?.problem ?? "请在 .env 设置 AI_API_KEY"}</span>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-2xl p-4">
              <p className="text-sm font-medium">你好，我是旅居 AI 助手 👋</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                用一句话告诉我你的旅行需求。我会查询真实房源、比较价格与设施，甚至直接帮你写入心愿单。
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground px-1 text-[11px] font-medium">试试这些：</p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  disabled={busy}
                  className="hover:border-primary/40 hover:bg-accent/50 w-full rounded-xl border px-3 py-2.5 text-left text-xs transition-colors disabled:opacity-60"
                >
                  {suggestion}
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
            正在理解你的需求…
          </div>
        ) : null}

        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">请求失败</p>
              <p className="mt-0.5 leading-relaxed">{error.message}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------------- input */}
      <div className="space-y-2 border-t px-4 py-3">
        {!user ? (
          <p className="text-muted-foreground text-[11px]">
            当前未登录：可以搜索与比较房源，收藏相关操作需要先登录。
          </p>
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
            placeholder="描述你的旅行需求，例如：国庆去东京 5 天，4 个人，每晚 800 左右…"
            rows={2}
            disabled={busy}
            className="min-h-11 resize-none text-sm"
          />

          {busy ? (
            <Button size="icon" variant="outline" onClick={stop} aria-label="停止生成">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={submit} disabled={!input.trim()} aria-label="发送">
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
            {uploading ? "解析中…" : "上传旅行计划"}
          </Button>

          {error ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-1.5 text-[11px]"
              onClick={retryLast}
            >
              <RotateCcw className="size-3.5" />
              重试
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
