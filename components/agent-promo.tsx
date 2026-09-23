"use client";

import { ArrowRight, Compass, GitCompare, Heart, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store";

const EXAMPLES = [
  {
    icon: Search,
    label: "自然语言搜索",
    prompt: "国庆想去东京玩 5 天，4 个人，每晚预算 800 元左右，希望离地铁近一点。",
  },
  {
    icon: Compass,
    label: "AI 智能推荐",
    prompt: "我和三个朋友去东京，预算每晚 800 元，希望交通方便，帮我选三个。",
  },
  {
    icon: GitCompare,
    label: "房源对比",
    prompt: "帮我比较刚才这几个房源，哪个更适合四个人？",
  },
  {
    icon: Heart,
    label: "操作心愿单",
    prompt: "把刚才推荐的第一个房源加入「东京旅行」心愿单。",
  },
];

/**
 * Marketing/entry section for the Agent.
 * Each example button opens the drawer with the prompt pre-filled — the user
 * still presses send, so nothing is sent implicitly.
 */
export function AgentPromo() {
  const openWithPrompt = useAgentStore((state) => state.openWithPrompt);

  return (
    <section id="agent" className="scroll-mt-20">
      <div className="from-primary/8 via-background to-background relative overflow-hidden rounded-3xl border bg-gradient-to-br p-8 sm:p-12">
        <div className="relative z-10 max-w-2xl">
          <div className="border-primary/30 text-primary bg-background/80 mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur">
            <Sparkles className="size-3.5" />
            AI Travel Agent
          </div>

          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            用一句话说清需求，剩下的交给 AI
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed sm:text-base">
            Agent 会调用真实的工具：查询 PostgreSQL、比较房源、写入心愿单。它不是聊天机器人，
            而是真正参与业务流程的一环。
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => openWithPrompt(EXAMPLES[0].prompt)} className="gap-2">
              <Sparkles className="size-4" />
              开始对话
            </Button>
            <Button variant="outline" asChild>
              <a href="#agent-examples" className="gap-2">
                看看它能做什么
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div id="agent-examples" className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example, index) => (
            <motion.button
              key={example.label}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              onClick={() => openWithPrompt(example.prompt)}
              className="bg-background/70 hover:border-primary/40 group flex items-start gap-3 rounded-2xl border p-4 text-left backdrop-blur transition-colors"
            >
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                <example.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{example.label}</span>
                <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">
                  「{example.prompt}」
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
