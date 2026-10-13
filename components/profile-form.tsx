"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Compass,
  Heart,
  Loader2,
  LogIn,
  Mail,
  MapPin,
  Palette,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ChipListEditor } from "@/components/chip-list-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { BellRing, Languages } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmptyState } from "@/components/empty-state";
import { ImageUploadField } from "@/components/image-upload-field";
import { ProfilePrivacyDialog } from "@/components/profile-privacy-dialog";
import { useLocale, useT } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { SettingsDrawer } from "@/components/settings-drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { PRESET_AVATARS } from "@/lib/avatars";
import { formatDate } from "@/lib/format";
import {
  COVER_PRESETS,
  DESTINATION_SUGGESTIONS,
  HOBBY_SUGGESTIONS,
  MAX_CHIPS,
  TAG_SUGGESTIONS,
  resolveCover,
} from "@/lib/profile-options";
import { cn } from "@/lib/utils";
import type { NotificationTypeValue, SessionUserDto } from "@/types";
import type { Translate } from "@/lib/i18n";

/**
 * Preset avatars, bundled locally (see lib/avatars.ts). They used to come from
 * i.pravatar.cc, which now 403s every request — most of the grid showed as
 * broken images.
 */
const AVATAR_PRESETS = PRESET_AVATARS;

/**
 * Profile page.
 *
 * Splits session handling from the editor so the editor can initialise its form
 * state directly from the resolved user. Seeding state from a prop via
 * useEffect would cause a cascading render (and is flagged by the React lint
 * rules); `key` remounts the editor if the account changes.
 */
/**
 * Which half of the editor to render.
 *
 * The editor used to be one page holding both the personal space (banner, stats,
 * name/avatar/cover) and the account settings (sign-in email, password, profile
 * visibility, the personalisation lists). That read as clutter: two unrelated jobs
 * competing on one screen. It is now the same component rendered in two places —
 * `/profile` for the personal space and `/settings` for the account — so state,
 * mutations, validation and the per-section save rows are shared rather than
 * duplicated.
 */
export type ProfileVariant = "profile" | "settings";

export function ProfileForm({ variant = "profile" }: { variant?: ProfileVariant } = {}) {
  const t = useT();
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={LogIn}
        title={t("account.loginTitle")}
        description={t("account.loginBody")}
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Fprofile">
              <LogIn className="size-4" />
              {t("account.goLogin")}
            </Link>
          </Button>
        }
      />
    );
  }

  return <ProfileEditor key={user.id} user={user} variant={variant} />;
}

/**
 * "This section has unsaved changes", as a dot beside the section title.
 *
 * A dot rather than a word because the label would be a new string in six
 * languages for something a tooltip already explains, and because the design
 * system already uses exactly this dot to mark the active theme option. The label
 * is still exposed to hover and to assistive technology.
 */
function UnsavedDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="bg-primary inline-block size-1.5 shrink-0 rounded-full"
    />
  );
}

/**
 * The save/revert row at the foot of a section.
 *
 * Rendered **only when the section has something to save**. It used to be always
 * present so the card's height never changed, but that produced a bar of permanently
 * disabled buttons hanging under every section — reported by a user as "a white strip
 * with 撤销修改 / 保存资料 that does nothing", which is exactly what it looked like.
 * A control that cannot be used is worse than one that is not there yet.
 *
 * Rendered inside the section it saves, so the button that commits a change sits with
 * the fields it commits. The page previously had one bar for the whole form, which
 * meant a chip added at the bottom lit up a bar above the nickname, and "save"
 * silently covered fields the user had not looked at.
 */
function SectionActions({
  dirty,
  pending,
  onSave,
  onRevert,
  saveLabel,
  revertLabel,
  pendingLabel,
  disabled,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onRevert: () => void;
  saveLabel: string;
  revertLabel: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  // Keep it on screen while a save is in flight, so the button does not vanish under
  // the pointer the moment it is pressed.
  if (!dirty && !pending) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-muted-foreground text-xs">{pending ? pendingLabel : ""}</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onRevert} disabled={!dirty || pending}>
          {revertLabel}
        </Button>
        <Button size="sm" className="gap-2" onClick={onSave} disabled={!dirty || pending || disabled}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * One row per notification type, in a fixed order so the list does not reshuffle
 * between visits. The labels come from the notifications module, which already
 * names these types; the settings page is simply another place they are read.
 */
const NOTIFICATION_TYPE_LABELS: Array<{
  type: NotificationTypeValue;
  labelKey: Parameters<Translate>[0];
}> = [
  { type: "FRIEND_REQUEST", labelKey: "notifications.typeFriendRequest" },
  { type: "FRIEND_ACCEPTED", labelKey: "notifications.typeFriendAccepted" },
  { type: "POST_REPLY", labelKey: "notifications.typePostReply" },
  { type: "BOOKING_CONFIRMED", labelKey: "notifications.typeBookingConfirmed" },
  { type: "BOOKING_CANCELLED", labelKey: "notifications.typeBookingCancelled" },
];

function ProfileEditor({ user, variant }: { user: SessionUserDto; variant: ProfileVariant }) {
  const { locale, t } = useLocale();
  const { refresh } = useSession();

  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [coverPreset, setCoverPreset] = useState(user.coverPreset ?? "");
  const [coverImage, setCoverImage] = useState(user.coverImage ?? "");
  const [coverImageBroken, setCoverImageBroken] = useState(false);
  const [tags, setTags] = useState<string[]>(user.tags);
  const [dreamDestinations, setDreamDestinations] = useState<string[]>(user.dreamDestinations);
  const [hobbies, setHobbies] = useState<string[]>(user.hobbies);
  const [visitedPlaces, setVisitedPlaces] = useState<string[]>(user.visitedPlaces);

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { data: wishlists } = useQuery({ queryKey: ["wishlists"], queryFn: api.listWishlists });
  const { data: trips } = useQuery({ queryKey: ["bookings"], queryFn: api.listBookings });

  /*
   * One mutation per section, each sending only its own fields.
   *
   * There used to be a single mutation plus a single bottom bar, so saving the
   * nickname also committed whatever happened to be pending in the
   * personalisation lists, and vice versa. The service has always accepted partial
   * updates ("a request that only edits hobbies must not wipe the banner") — the
   * editor simply never used that, which is why "保存资料" was ambiguous about what
   * it would save.
   */
  const savedHandlers = {
    onSuccess: async (result: { user: SessionUserDto }) => {
      await refresh();
      toast.success(t("account.saved"), {
        description: t("account.savedDetail", { name: result.user.name }),
      });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? error.message : t("account.saveFailed")),
  };

  const publicInfoMutation = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim(), avatar, coverPreset, coverImage }),
    ...savedHandlers,
  });

  const personalisationMutation = useMutation({
    mutationFn: () => api.updateProfile({ tags, dreamDestinations, hobbies, visitedPlaces }),
    ...savedHandlers,
  });

  /**
   * Notification preferences save on their own too.
   *
   * Folding them into the personalisation request would have meant one Save button
   * committing two unrelated sections — the exact ambiguity the section split was
   * introduced to remove.
   */
  const notificationPrefsMutation = useMutation({
    mutationFn: () => api.updateProfile({ mutedNotificationTypes }),
    ...savedHandlers,
  });

  /** Email change: its own little form, with its own password confirmation. */
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });

  /** Types the user has switched off. Empty means everything is on. */
  const [mutedNotificationTypes, setMutedNotificationTypes] = useState<NotificationTypeValue[]>(
    user.mutedNotificationTypes,
  );

  const emailMutation = useMutation({
    mutationFn: () => api.changeEmail(emailForm),
    onSuccess: async () => {
      await refresh();
      setEmailOpen(false);
      setEmailForm({ email: "", currentPassword: "" });
      toast.success(t("account.emailChanged"), {
        description: t("account.emailChangedDetail"),
      });
    },
    onError: (error) => {
      const details = (error as ApiClientError)?.details as
        Array<{ path: string; message: string }> | undefined;
      toast.error(
        details?.[0]?.message ??
          (error instanceof ApiClientError ? error.message : t("account.saveFailed")),
      );
    },
  });

  const passwordMutation = useMutation({    mutationFn: () => api.changePassword(passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success(t("account.passwordChanged"), {
        description: t("account.passwordChangedDetail"),
      });
    },
    onError: (error) => {
      const details = (error as ApiClientError)?.details as
        Array<{ path: string; message: string }> | undefined;
      toast.error(
        details?.[0]?.message ??
          (error instanceof ApiClientError ? error.message : t("account.passwordFailed")),
      );
    },
  });

  const same = (a: string[], b: string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);

  /*
   * Dirty state is tracked **per section**, not once for the page.
   *
   * The page has a single save bar, but it covers two unrelated groups of fields:
   * the public details (name, avatar, cover) and the personalisation lists. One
   * combined flag meant the bar said "you have unsaved changes" without saying
   * *where*, and a chip added three sections further down lit up a bar next to the
   * nickname. Each section now carries its own marker so the global bar and the
   * sections agree.
   */
  const publicInfoDirty =
    name.trim() !== user.name ||
    avatar !== (user.avatar ?? "") ||
    coverPreset !== (user.coverPreset ?? "") ||
    coverImage !== (user.coverImage ?? "");

  const personalisationDirty =
    !same(tags, user.tags) ||
    !same(dreamDestinations, user.dreamDestinations) ||
    !same(hobbies, user.hobbies) ||
    !same(visitedPlaces, user.visitedPlaces);

  /**
   * Compared as sets: the order the toggles happen to be in is not a change, and
   * treating it as one would light up the unsaved marker for nothing.
   */
  const notificationPrefsDirty =
    mutedNotificationTypes.length !== user.mutedNotificationTypes.length ||
    [...mutedNotificationTypes].sort().join(",") !==
      [...user.mutedNotificationTypes].sort().join(",");

  const passwordReady =
    passwords.currentPassword.length > 0 &&
    passwords.newPassword.length >= 8 &&
    passwords.newPassword === passwords.confirmPassword;

  /** Both fields filled and the address differs from the current one. */
  const emailReady =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email.trim()) &&
    emailForm.currentPassword.length > 0 &&
    emailForm.email.trim().toLowerCase() !== user.email.toLowerCase();

  const favouriteCount =
    wishlists?.wishlists.reduce((sum, wishlist) => sum + wishlist.itemCount, 0) ?? 0;

  // Live preview: what the banner will look like once saved.
  const cover = resolveCover(coverImageBroken ? null : coverImage, coverPreset);

  /** Revert one section to what the server currently holds. */
  const resetPublicInfo = () => {
    setName(user.name);
    setAvatar(user.avatar ?? "");
    setCoverPreset(user.coverPreset ?? "");
    setCoverImage(user.coverImage ?? "");
    setCoverImageBroken(false);
  };

  const resetPersonalisation = () => {
    setTags(user.tags);
    setDreamDestinations(user.dreamDestinations);
    setHobbies(user.hobbies);
    setVisitedPlaces(user.visitedPlaces);
  };

  const resetNotificationPrefs = () => setMutedNotificationTypes(user.mutedNotificationTypes);

  // An em dash stands in while its query is still in flight; the value templates
  // are part of the dictionary so the unit lands on the right side of the number
  // in every language.
  const stats: { label: string; value: string }[] = [
    {
      label: t("account.statWishlists"),
      value: t("account.statWishlistsValue", { value: wishlists?.wishlists.length ?? "—" }),
    },
    {
      label: t("account.statSaved"),
      value: t("account.statSavedValue", { value: wishlists ? favouriteCount : "—" }),
    },
    {
      label: t("account.statTrips"),
      value: t("account.statTripsValue", { value: trips?.bookings.length ?? "—" }),
    },
    { label: t("account.statJoined"), value: formatDate(user.createdAt, locale) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("account.title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("account.subtitle")}</p>
      </div>

      {/* ------------------------------------------------------ banner preview */}
      {/* ------------------------------------------------- personal space only */}
      {variant === "profile" ? (
        <>
          <section className="relative overflow-hidden rounded-2xl border">
        {cover.kind === "image" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt=""
              className="h-44 w-full object-cover"
              onError={() => setCoverImageBroken(true)}
            />
            {coverImageBroken ? (
              <p className="text-muted-foreground absolute top-2 right-3 text-xs">
                {t("account.coverBroken")}
              </p>
            ) : null}
          </>
        ) : (
          <div className={cn("h-44 w-full", cover.className)} />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
          <div className="flex items-end gap-3">
            <Avatar className="size-16 border-2 border-white/70 shadow-lg">
              {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
              <AvatarFallback className="text-lg">{name.slice(0, 1) || "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 pb-1">
              <p className="truncate font-semibold text-white">{name || t("account.nameEmpty")}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
                <Mail className="size-3" />
                {user.email}
              </p>
              {tags.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- account meta */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-4">
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p className="mt-1 text-sm font-semibold">{tile.value}</p>
            </div>
          ))}
        </div>

        {/* The settings entry sits beside the personal space rather than inside it:
            that separation is the whole point of splitting the two. */}
        <SettingsDrawer />
      </div>
        </>
      ) : null}

      {/* -------------------------------------------------- public details */}
      {variant === "profile" ? (
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BadgeCheck className="text-primary size-4" />
              <h2 className="text-sm font-semibold">{t("account.publicInfo")}</h2>
              {publicInfoDirty ? <UnsavedDot label={t("account.unsaved")} /> : null}
            </div>
            {/* Who may open `/u/<my id>`. Sits in this section's header rather
                than in the account-security column because it is a property of
                the public profile, not of the credentials. */}
            <ProfilePrivacyDialog />
          </div>
          <p className="text-muted-foreground text-xs">{t("account.publicInfoHint")}</p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("account.chooseAvatar")}</Label>
              <span className="text-muted-foreground text-xs">
                {t("account.presetCount", { count: AVATAR_PRESETS.length })}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAvatar(preset)}
                  aria-label={t("account.useAvatar")}
                  aria-pressed={avatar === preset}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-full border-2 transition-all",
                    avatar === preset ? "border-primary" : "border-transparent hover:opacity-80",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preset} alt="" className="size-full object-cover" loading="lazy" />
                  {avatar === preset ? (
                    <span className="bg-primary text-primary-foreground absolute inset-0 flex items-center justify-center">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t("account.nickname")}</Label>
            <Input
              id="name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("account.nicknamePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("account.uploadAvatar")}</Label>
            {/* Local file upload replaces the old "paste an image URL" field: a
                URL input asks the user to already be hosting the file, and
                makes the profile depend on a third-party host. */}
            <ImageUploadField
              kind="avatar"
              label={t("account.uploadAvatar")}
              value={avatar}
              onChange={setAvatar}
              disabled={publicInfoMutation.isPending}
              previewClassName="rounded-full"
            />
          </div>

          <Separator />

          {/* ------------------------------------------------------ cover */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="text-primary size-3.5" />
              <Label>{t("account.cover")}</Label>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {COVER_PRESETS.map((preset) => {
                const active = !coverImage && coverPreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    title={preset.label}
                    aria-label={t("account.coverUse", { name: preset.label })}
                    aria-pressed={active}
                    onClick={() => {
                      setCoverPreset(preset.key);
                      setCoverImage("");
                      setCoverImageBroken(false);
                    }}
                    className={cn(
                      "relative h-10 overflow-hidden rounded-lg border-2 transition-all",
                      preset.className,
                      active ? "border-primary" : "border-transparent hover:opacity-85",
                    )}
                  >
                    {active ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Check className="size-4 text-white" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              {/*
                Three lines were removed here at the user's request: the
                "或从本地上传背景图" label, the JPG/PNG size hint under the button, and
                the "背景图加载失败时会自动回退…" reassurance. The section already reads
                as "pick a gradient or upload one" — the presets are above it and the
                button says 上传本地背景图 — so the copy was restating the layout, and
                the format hint is still shown by the control itself when a file is
                rejected.
              */}
              <ImageUploadField
                kind="cover"
                label={t("account.uploadCover")}
                value={coverImage}
                onChange={(next) => {
                  setCoverImage(next);
                  setCoverImageBroken(false);
                }}
                disabled={publicInfoMutation.isPending}
                previewClassName="aspect-video w-24"
              />
            </div>
          </div>

          <SectionActions
            dirty={publicInfoDirty}
            pending={publicInfoMutation.isPending}
            onSave={() => publicInfoMutation.mutate()}
            onRevert={resetPublicInfo}
            saveLabel={t("account.save")}
            revertLabel={t("account.undo")}
            pendingLabel={t("account.unsaved")}
            disabled={!name.trim()}
          />

          <Separator />

          {/*
            The sign-in address used to be echoed here as read-only ("email is
            fixed"), which stopped being true once it could be changed — and it
            belongs to the account, not to the public profile. It now lives in
            `/settings` as an editable field, so all that is left here is when the
            account was created.
          */}
          <div className="text-muted-foreground space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {t("account.joinedAt", { date: formatDate(user.createdAt, locale) })}
            </p>
          </div>
        </section>

      ) : null}

      {/* ------------------------------------------------ account and security */}
      {variant === "settings" ? (
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" />
            <h2 className="text-sm font-semibold">{t("account.security")}</h2>
          </div>
          <p className="text-muted-foreground text-xs">{t("account.securityHint")}</p>

          {/*
            The sign-in address, as a first-class account field rather than
            something only the registration form ever set. It requires the current
            password, like the password change below it: a stolen cookie must not be
            enough to move the account to an address the thief controls, which would
            lock the real owner out without them ever seeing a prompt.
          */}
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("account.email")}</p>
                <p className="text-muted-foreground truncate text-sm">{user.email}</p>
              </div>
              {!emailOpen ? (
                <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
                  {t("account.changeEmail")}
                </Button>
              ) : null}
            </div>

            {emailOpen ? (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-2">
                  <Label htmlFor="newEmail">{t("account.newEmail")}</Label>
                  <Input
                    id="newEmail"
                    type="email"
                    autoComplete="email"
                    value={emailForm.email}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder={t("account.newEmailPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emailCurrentPassword">{t("account.currentPassword")}</Label>
                  <Input
                    id="emailCurrentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={emailForm.currentPassword}
                    onChange={(event) =>
                      setEmailForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                    }
                    placeholder={t("account.currentPasswordPlaceholder")}
                  />
                </div>
                <p className="text-muted-foreground text-xs">{t("account.emailHint")}</p>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEmailOpen(false);
                      setEmailForm({ email: "", currentPassword: "" });
                    }}
                    disabled={emailMutation.isPending}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => emailMutation.mutate()}
                    disabled={!emailReady || emailMutation.isPending}
                  >
                    {emailMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("account.changeEmail")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("account.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))
              }
              placeholder={t("account.currentPasswordPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("account.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))
              }
              placeholder={t("account.newPasswordPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("account.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))
              }
              placeholder={t("account.confirmPasswordPlaceholder")}
            />
            {passwords.confirmPassword.length > 0 &&
            passwords.newPassword !== passwords.confirmPassword ? (
              <p className="text-destructive text-xs">{t("account.passwordMismatch")}</p>
            ) : null}
          </div>

          <Button
            variant="outline"
            onClick={() => passwordMutation.mutate()}
            disabled={!passwordReady || passwordMutation.isPending}
            className="gap-2"
          >
            {passwordMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("account.changePassword")}
          </Button>

          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("account.passwordHint")}
          </p>
        </section>
      ) : null}

      {/*
        ------------------------------------------------------------------ settings

        Everything below belongs to the account rather than to the public profile:
        notification preferences, the language and appearance controls, and the
        personalisation lists... except those last ones are *content*, so they live
        on the profile page instead (see the `profile` gate further down).
      */}
      {variant === "settings" ? (
        <>
          {/*
            Language and appearance.

            These moved out of the header: three separate preference controls up
            there (language, theme, settings) made the user hunt for which one holds
            what. They are preferences, so they belong with the other preferences —
            and they still write immediately, because switching a language is not a
            form to submit.
          */}
          <section className="space-y-4 rounded-2xl border p-5">
            <div className="flex items-center gap-2">
              <Languages className="text-primary size-4" />
              <h2 className="text-sm font-semibold">{t("account.settingsPreferences")}</h2>
            </div>
            <p className="text-muted-foreground text-xs">{t("account.settingsPreferencesHint")}</p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{t("locale.label")}</span>
              <LocaleSwitcher />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{t("globals.themeToggle")}</span>
              <ThemeToggle />
            </div>
          </section>

          {/*
            Notification preferences. Saves like every other section (the mute list
            rides along on the same profile PATCH), so this page keeps one save
            mechanism rather than growing a second one for this card.
          */}
          <section className="space-y-4 rounded-2xl border p-5">
            <div className="flex items-center gap-2">
              <BellRing className="text-primary size-4" />
              <h2 className="text-sm font-semibold">{t("notifications.prefsTitle")}</h2>
              {notificationPrefsDirty ? <UnsavedDot label={t("account.unsaved")} /> : null}
            </div>
            <p className="text-muted-foreground text-xs">{t("notifications.prefsHint")}</p>

            <ul className="space-y-2">
              {NOTIFICATION_TYPE_LABELS.map(({ type, labelKey }) => {
                const muted = mutedNotificationTypes.includes(type);
                return (
                  <li key={type} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{t(labelKey)}</span>
                    {/* A checkbox, not a switch: this project has no Switch primitive
                        and adding one would mean a new dependency for a toggle.
                        `aria-label` rather than a bound <label>: the visible text sits
                        next to the control, and this way the control is named whether
                        or not the primitive forwards its `id`. */}
                    <Checkbox
                      id={`notify-${type}`}
                      aria-label={t(labelKey)}
                      checked={!muted}
                      onCheckedChange={(checked) =>
                        setMutedNotificationTypes((previous) =>
                          checked === true
                            ? previous.filter((value) => value !== type)
                            : [...previous, type],
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>

            {/* Honest about the phase boundary: the switch that would send mail is
                not here yet, and a fake one would be worse than none. */}
            <p className="text-muted-foreground border-t pt-3 text-xs">
              {t("notifications.emailNote")}
            </p>

            <SectionActions
              dirty={notificationPrefsDirty}
              pending={notificationPrefsMutation.isPending}
              onSave={() => notificationPrefsMutation.mutate()}
              onRevert={resetNotificationPrefs}
              saveLabel={t("common.save")}
              revertLabel={t("account.undo")}
              pendingLabel={t("account.unsaved")}
            />
          </section>
        </>
      ) : null}

      {/*
        Personalisation is *content*, not configuration: these four lists are shown
        on the public profile, so they belong on the page that owns the public
        profile. They were briefly on the settings page during the split, which was
        a mistake — the profile page had nothing left to edit.
      */}
      {variant === "profile" ? (
        <section className="space-y-6 rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary size-4" />
          <h2 className="text-sm font-semibold">{t("account.personalisation")}</h2>
          {personalisationDirty ? <UnsavedDot label={t("account.unsaved")} /> : null}
          <span className="text-muted-foreground ml-auto text-xs">
            {t("account.personalisationHint")}
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ChipListEditor
            id="tags"
            label={t("account.tags")}
            icon={Tag}
            hint={t("account.tagsHint")}
            placeholder={t("account.tagsPlaceholder")}
            suggestions={TAG_SUGGESTIONS}
            values={tags}
            onChange={setTags}
            max={MAX_CHIPS.tags}
            emptyText={t("account.tagsEmpty")}
          />

          <ChipListEditor
            id="hobbies"
            label={t("account.hobbies")}
            icon={Heart}
            hint={t("account.hobbiesHint")}
            placeholder={t("account.hobbiesPlaceholder")}
            suggestions={HOBBY_SUGGESTIONS}
            values={hobbies}
            onChange={setHobbies}
            max={MAX_CHIPS.hobbies}
            emptyText={t("account.hobbiesEmpty")}
          />

          <ChipListEditor
            id="dreamDestinations"
            label={t("account.dreamDestinations")}
            icon={Compass}
            hint={t("account.dreamDestinationsHint")}
            placeholder={t("account.dreamDestinationsPlaceholder")}
            suggestions={DESTINATION_SUGGESTIONS}
            values={dreamDestinations}
            onChange={setDreamDestinations}
            max={MAX_CHIPS.dreamDestinations}
            emptyText={t("account.dreamDestinationsEmpty")}
          />

          <ChipListEditor
            id="visitedPlaces"
            label={t("account.visitedPlaces")}
            icon={MapPin}
            hint={t("account.visitedPlacesHint")}
            placeholder={t("account.visitedPlacesPlaceholder")}
            suggestions={DESTINATION_SUGGESTIONS}
            values={visitedPlaces}
            onChange={setVisitedPlaces}
            max={MAX_CHIPS.visitedPlaces}
            variant="tile"
            emptyText={t("account.visitedPlacesEmpty")}
          />
        </div>

        <SectionActions
          dirty={personalisationDirty}
          pending={personalisationMutation.isPending}
          onSave={() => personalisationMutation.mutate()}
          onRevert={resetPersonalisation}
          // "保存" rather than the public-details section's "保存资料": this button
          // saves the lists, not the profile details.
          saveLabel={t("common.save")}
          revertLabel={t("account.undo")}
          pendingLabel={t("account.unsaved")}
        />
        </section>
      ) : null}
    </div>
  );
}
