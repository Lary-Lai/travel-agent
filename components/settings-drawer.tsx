"use client";

import { ChevronRight, Map, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProfileForm } from "@/components/profile-form";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * The ☰ settings entry that sits beside the personal space.
 *
 * It renders the *same* `ProfileForm variant="settings"` as `/settings`, so the
 * drawer and the page cannot drift apart — there is one implementation of the
 * account fields, reached two ways. The trigger is icon-only with an accessible
 * name, and the sheet carries a title so the drawer announces what it is rather
 * than presenting an unexplained list of fields.
 */
export function SettingsDrawer() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/*
          Icon only, at the user's request. The label lives on in `aria-label`, so the
          control is still announced as "设置" — an icon-only button without a name is a
          button a screen reader can only call "button".
        */}
        <Button variant="outline" size="icon" aria-label={t("account.settingsTitle")}>
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{t("account.settingsTitle")}</SheetTitle>
          <SheetDescription>{t("account.settingsSubtitle")}</SheetDescription>
        </SheetHeader>

        {/* Trip planning lives on its own page — a map needs the width — so the
            drawer offers the way in rather than a cramped copy of it. */}
        <Link
          href="/plan"
          onClick={() => setOpen(false)}
          className="hover:bg-accent mb-4 flex items-center gap-3 rounded-xl border p-3 transition-colors"
        >
          <Map className="text-primary size-4" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("plan.title")}</span>
            <span className="text-muted-foreground block text-xs">{t("plan.drawerHint")}</span>
          </span>
          <ChevronRight className="text-muted-foreground size-4" />
        </Link>

        <ProfileForm variant="settings" />
      </SheetContent>
    </Sheet>
  );
}
