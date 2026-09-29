"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Globe,
  Loader2,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProfilePrivacyDto, ProfileVisibilityValue, PublicUserBrief } from "@/types";

/**
 * Who may open your profile.
 *
 * The four modes are mutually exclusive (see `ProfileVisibility` in the schema),
 * so they are rendered as a radio group of cards rather than four switches: a
 * pair of toggles would let the UI express "public and friends-only", which is
 * not a state the server can store.
 */
const MODES = [
  {
    value: "PUBLIC",
    labelKey: "social.visibilityPublic",
    hintKey: "social.visibilityPublicHint",
    icon: Globe,
  },
  {
    value: "FRIENDS",
    labelKey: "social.visibilityFriends",
    hintKey: "social.visibilityFriendsHint",
    icon: Users,
  },
  {
    value: "SELECTED",
    labelKey: "social.visibilitySelected",
    hintKey: "social.visibilitySelectedHint",
    icon: UserCheck,
  },
  {
    value: "PRIVATE",
    labelKey: "social.visibilityPrivate",
    hintKey: "social.visibilityPrivateHint",
    icon: Lock,
  },
] as const satisfies ReadonlyArray<{
  value: ProfileVisibilityValue;
  labelKey: string;
  hintKey: string;
  icon: typeof Globe;
}>;

/**
 * The visibility dialog.
 *
 * Needs no props: it carries its own trigger, so the profile page can drop it in
 * anywhere with `<ProfilePrivacyDialog />` and the settings stay owned by one
 * component instead of being threaded through a form.
 */
export function ProfilePrivacyDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  // Fetched when the dialog opens, not on mount: the profile page should not pay
  // for this query unless the user actually asks about visibility.
  const { data } = useQuery({
    queryKey: ["privacy"],
    queryFn: api.getPrivacy,
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <ShieldAlert className="size-4" />
            {t("social.privacyOpen")}
          </Button>
        )}
      </DialogTrigger>

      {/* Radix unmounts the content when closed, so the editor below starts from
          the server's answer every time it opens instead of from a stale draft. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("social.privacyOpen")}</DialogTitle>
          <DialogDescription>{t("social.privacyDescription")}</DialogDescription>
        </DialogHeader>

        {data ? (
          <PrivacyEditor initial={data} onSaved={() => setOpen(false)} />
        ) : (
          <div className="space-y-3 py-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PrivacyEditor({
  initial,
  onSaved,
}: {
  initial: ProfilePrivacyDto;
  onSaved: () => void;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();

  const [visibility, setVisibility] = useState<ProfileVisibilityValue>(initial.visibility);
  const [allow, setAllow] = useState<PublicUserBrief[]>(initial.allow);
  const [deny, setDeny] = useState<PublicUserBrief[]>(initial.deny);

  const save = useMutation({
    mutationFn: () =>
      api.savePrivacy({
        visibility,
        allow: allow.map((person) => person.id),
        deny: deny.map((person) => person.id),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["privacy"] });
      // Public profiles are rendered from these same settings, so a cached
      // profile read (your own, or one you just changed access to) is stale.
      void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["user-search"] });
      toast.success(t("social.saved"));
      onSaved();
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : t("social.saveFailed")),
  });

  /**
   * A block beats everything, so the two lists cannot both hold the same person.
   *
   * Adding to the allow-list while they are blocked is refused *here* rather than
   * silently dropping the block: the user asked for two contradictory things and
   * deserves to be told which one the server keeps.
   */
  const addToAllow = (person: PublicUserBrief) => {
    if (deny.some((entry) => entry.id === person.id)) {
      toast.error(t("social.blockedWins"));
      return;
    }
    setAllow((current) =>
      current.some((entry) => entry.id === person.id) ? current : [...current, person],
    );
  };

  const addToDeny = (person: PublicUserBrief) => {
    // The mirror image: blocking someone who was allowed simply replaces the
    // grant, which is what the server would store anyway.
    setAllow((current) => current.filter((entry) => entry.id !== person.id));
    setDeny((current) =>
      current.some((entry) => entry.id === person.id) ? current : [...current, person],
    );
  };

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label={t("social.visibilityTitle")} className="grid gap-2 sm:grid-cols-2">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const active = visibility === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setVisibility(mode.value)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(mode.labelKey)}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {t(mode.hintKey)}
                </span>
              </span>
              {active ? <Check className="text-primary ml-auto size-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>

      {/* Stated once, above the lists, because it is the rule that surprises
          people: a per-person decision outranks the mode they just picked. */}
      <p className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        {t("social.denyListHint")}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <PersonPicker
          id="privacy-allow"
          label={t("social.allowList")}
          hint={t("social.addPerson")}
          selected={allow}
          onAdd={addToAllow}
          onRemove={(person) => setAllow((current) => current.filter((entry) => entry.id !== person.id))}
        />
        <PersonPicker
          id="privacy-deny"
          label={t("social.denyList")}
          hint={t("social.denyListHint")}
          selected={deny}
          onAdd={addToDeny}
          onRemove={(person) => setDeny((current) => current.filter((entry) => entry.id !== person.id))}
        />
      </div>

      {/* PRIVATE refuses everyone, exception rows included, so the two lists are
          inert while it is selected. Said out loud rather than disabling the
          pickers: silently dropping names a user just added would be worse, and
          the lists are kept for when they switch back to a mode that uses them. */}
      {visibility === "PRIVATE" ? (
        <p className="text-muted-foreground flex items-start gap-2 rounded-xl border border-dashed p-3 text-xs leading-relaxed">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          {t("social.privateListsIgnored")}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          className="gap-2"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("social.saveVisibility")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * One exception list: search box, results, and the current entries as chips.
 *
 * The search term is deferred rather than debounced with a timer, so typing
 * stays responsive without an effect that re-renders state a beat later.
 */
function PersonPicker({
  id,
  label,
  hint,
  selected,
  onAdd,
  onRemove,
}: {
  id: string;
  label: string;
  hint: string;
  selected: PublicUserBrief[];
  onAdd: (person: PublicUserBrief) => void;
  onRemove: (person: PublicUserBrief) => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const term = useDeferredValue(query).trim();

  // An empty term is a real query: the API answers it with a short default list
  // of the newest accounts, which is what makes the picker usable on open.
  const { data, isFetching } = useQuery({
    queryKey: ["user-search", term],
    queryFn: () => api.searchUsers(term),
    staleTime: 30_000,
  });

  const chosen = new Set(selected.map((person) => person.id));
  const results = (data?.users ?? []).filter((person) => !chosen.has(person.id));

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          id={id}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("social.pickerPlaceholder")}
          className="pl-8"
        />
      </div>

      <div className="min-h-9">
        {isFetching && results.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("social.pickerSearching")}</p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-xs">{term ? t("social.pickerEmpty") : hint}</p>
        ) : (
          <>
            {/* Labelled on purpose. These pills are search results, but they sit
                directly above the chips of people already on the list and look
                identical to them — unlabelled, the control reads as two
                contradictory copies of the same list. */}
            <p className="text-muted-foreground mb-1.5 text-[11px]">
              {t("social.pickerSuggestions")}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {results.slice(0, 12).map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(person)}
                    className="hover:bg-muted flex items-center gap-1.5 rounded-full border border-dashed py-0.5 pr-2.5 pl-0.5 text-xs transition-colors"
                  >
                    <Avatar className="size-5">
                      {person.avatar ? <AvatarImage src={person.avatar} alt="" /> : null}
                      <AvatarFallback className="text-[9px]">
                        {person.name.slice(0, 1) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <Plus className="size-3" />
                    {person.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        {selected.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("social.listEmpty")}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-[11px]">{t("social.listHeading")}</p>
            <ul className="flex flex-wrap gap-1.5" data-testid={`${id}-selected`}>
            {selected.map((person) => (
              <li
                key={person.id}
                className="bg-secondary text-secondary-foreground flex items-center gap-1.5 rounded-full py-0.5 pr-1 pl-0.5 text-xs"
              >
                <Avatar className="size-5">
                  {person.avatar ? <AvatarImage src={person.avatar} alt="" /> : null}
                  <AvatarFallback className="text-[9px]">{person.name.slice(0, 1) || "?"}</AvatarFallback>
                </Avatar>
                {person.name}
                <button
                  type="button"
                  onClick={() => onRemove(person)}
                  aria-label={`${t("social.removePerson")} ${person.name}`}
                  className="hover:bg-background/60 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </div>
  );
}
