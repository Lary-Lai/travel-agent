"use client";

import { ArrowRight, Compass, GitCompare, Heart, Search, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { useAgentStore } from "@/lib/store";

const EXAMPLES = [  {
    icon: Search,
    labelKey: "agent.exampleSearch",
    promptKey: "agent.exampleSearchPrompt",
  },
  {
    icon: Compass,
    labelKey: "agent.exampleRecommend",
    promptKey: "agent.exampleRecommendPrompt",
  },
  {
    icon: GitCompare,
    labelKey: "agent.exampleCompare",
    promptKey: "agent.exampleComparePrompt",
  },
  {
    icon: Heart,
    labelKey: "agent.exampleWishlist",
    promptKey: "agent.exampleWishlistPrompt",
  },
] as const;

/**
 * Marketing/entry section for the Agent.
 * Each example button opens the drawer with the prompt pre-filled — the user
 * still presses send, so nothing is sent implicitly.
 */
export function AgentPromo() {
  const t = useT();
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
            {t("agent.promoTitle")}
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed sm:text-base">
            {t("agent.promoBody")}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => openWithPrompt(t(EXAMPLES[0].promptKey))} className="gap-2">
              <Sparkles className="size-4" />
              {t("agent.promoStart")}
            </Button>
            <Button variant="outline" asChild>
              <a href="#agent-examples" className="gap-2">
                {t("agent.promoExamples")}
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div id="agent-examples" className="relative z-10 mt-8 grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example, index) => (
            <motion.button
              key={example.labelKey}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              onClick={() => openWithPrompt(t(example.promptKey))}
              className="bg-background/70 hover:border-primary/40 group flex items-start gap-3 rounded-2xl border p-4 text-left backdrop-blur transition-colors"
            >
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                <example.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(example.labelKey)}</span>
                <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">
                  「{t(example.promptKey)}」
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
