"use client";

import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Info,
  KeyRound,
  ScrollText,
} from "lucide-react";

import { useT } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { HouseRules } from "@/types";

type Props = {
  rules: HouseRules;
  title: string;
  /** Rendered inline under the booking widget, or as a standalone button. */
  variant?: "button" | "inline";
};

/**
 * 入住须知 — check-in logistics and house rules.
 *
 * A dialog rather than a permanently expanded block: it is reference material a
 * guest checks once or twice, and inlining it would push the price breakdown off
 * the screen. Reachable from the booking widget so it is discoverable at exactly
 * the moment someone is deciding whether to book.
 */
export function HouseRulesPanel({ rules, title, variant = "button" }: Props) {
  const t = useT();

  const content = (
    <div className="space-y-5">
      {/* Check-in / out times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="size-3.5" />
            {t("houseRules.checkInTime")}
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums">{rules.checkInTime}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{t("houseRules.afterCheckIn")}</p>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarCheck className="size-3.5" />
            {t("houseRules.checkOutTime")}
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums">{rules.checkOutTime}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">{t("houseRules.beforeCheckOut")}</p>
        </div>
      </div>

      <div className="bg-secondary/50 flex items-start gap-2.5 rounded-xl p-3">
        <KeyRound className="text-primary mt-0.5 size-4 shrink-0" />
        <p className="text-xs leading-relaxed">
          {t("houseRules.selfCheckIn")}
        </p>
      </div>

      <Separator />

      {/* House rules */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <ScrollText className="text-primary size-4" />
          <h3 className="text-sm font-semibold">{t("houseRules.rules")}</h3>
          <Badge variant="secondary" className="ml-auto text-[11px]">
            {t("houseRules.rulesCount", { count: rules.rules.length })}
          </Badge>
        </div>
        <ul className="space-y-2">
          {rules.rules.map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-sm leading-relaxed">
              <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      {/* Practical notes */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Info className="text-primary size-4" />
          <h3 className="text-sm font-semibold">{t("houseRules.notes")}</h3>
        </div>
        <ul className="space-y-2">
          {rules.notes.map((note) => (
            <li
              key={note}
              className="text-muted-foreground flex items-start gap-2 text-sm leading-relaxed"
            >
              <BedDouble className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              {note}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {t("houseRules.agreement")}
      </p>
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === "inline" ? (
          <button
            type="button"
            className="hover:bg-accent flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors"
          >
            <ScrollText className="text-primary size-4 shrink-0" />
            <span className="text-sm font-medium">{t("houseRules.title")}</span>
            <span className="text-muted-foreground ml-auto text-xs">
              {t("houseRules.summary", { checkIn: rules.checkInTime, checkOut: rules.checkOutTime })}
            </span>
          </button>
        ) : (
          <Button variant="outline" className="w-full gap-2">
            <ScrollText className="size-4" />
            {t("houseRules.view")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="text-primary size-4" />
            {t("houseRules.title")}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{title}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
