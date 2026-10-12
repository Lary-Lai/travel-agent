"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Compass,
  Heart,
  ImageOff,
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
import { EmptyState } from "@/components/empty-state";
import { ImageUploadField } from "@/components/image-upload-field";
import { ProfilePrivacyDialog } from "@/components/profile-privacy-dialog";
import { useLocale, useT } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
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
import type { SessionUserDto } from "@/types";

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
export function ProfileForm() {
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

  return <ProfileEditor key={user.id} user={user} />;
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
 * Rendered inside the section it saves, so the button that commits a change sits
 * with the fields it commits. The page previously had one bar for the whole form,
 * which meant a chip added at the bottom lit up a bar above the nickname, and
 * "save" silently covered fields the user had not looked at.
 *
 * The row is always present (rather than appearing only when dirty) so the
 * section's shape does not jump as you type; only the buttons' state changes.
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
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-muted-foreground text-xs">
        {dirty ? pendingLabel : ""}
      </p>
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

function ProfileEditor({ user }: { user: SessionUserDto }) {
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

  /** Email change: its own little form, with its own password confirmation. */
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((tile) => (
          <div key={tile.label} className="rounded-2xl border p-4">
            <p className="text-muted-foreground text-xs">{tile.label}</p>
            <p className="mt-1 text-sm font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>

      {/*
        Weighted columns rather than equal ones: the public details are what the
        user came to edit, while account security is secondary. At 1:1 the security
        card was as wide as the profile card and the page had no visual centre.
      */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* -------------------------------------------------------- profile */}
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
              <Label className="text-xs font-normal">{t("account.coverUpload")}</Label>
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
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <ImageOff className="size-3" />
                {t("account.coverHint")}
              </p>
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

          <div className="text-muted-foreground space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {t("account.emailFixed", { email: user.email })}
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {t("account.joinedAt", { date: formatDate(user.createdAt, locale) })}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------- password */}
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
      </div>

      {/* ------------------------------------------------------ personalisation */}
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
    </div>
  );
}
