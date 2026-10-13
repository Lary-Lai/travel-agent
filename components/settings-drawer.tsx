"use client";

import { Menu } from "lucide-react";
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
        <Button variant="outline" size="sm" className="gap-2" aria-label={t("account.settingsTitle")}>
          <Menu className="size-4" />
          <span className="hidden sm:inline">{t("account.settingsTitle")}</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle>{t("account.settingsTitle")}</SheetTitle>
          <SheetDescription>{t("account.settingsSubtitle")}</SheetDescription>
        </SheetHeader>

        <ProfileForm variant="settings" />
      </SheetContent>
    </Sheet>
  );
}
