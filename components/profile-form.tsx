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
import { useT } from "@/components/locale-provider";
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

function ProfileEditor({ user }: { user: SessionUserDto }) {
  const t = useT();
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

  const profileMutation = useMutation({
    mutationFn: () =>
      api.updateProfile({
        name: name.trim(),
        avatar,
        coverPreset,
        coverImage,
        tags,
        dreamDestinations,
        hobbies,
        visitedPlaces,
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(t("account.saved"), {
        description: t("account.savedDetail", { name: result.user.name }),
      });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : t("account.saveFailed")),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.changePassword(passwords),
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

  const dirty =
    name.trim() !== user.name ||
    avatar !== (user.avatar ?? "") ||
    coverPreset !== (user.coverPreset ?? "") ||
    coverImage !== (user.coverImage ?? "") ||
    !same(tags, user.tags) ||
    !same(dreamDestinations, user.dreamDestinations) ||
    !same(hobbies, user.hobbies) ||
    !same(visitedPlaces, user.visitedPlaces);

  const passwordReady =
    passwords.currentPassword.length > 0 &&
    passwords.newPassword.length >= 8 &&
    passwords.newPassword === passwords.confirmPassword;

  const favouriteCount =
    wishlists?.wishlists.reduce((sum, wishlist) => sum + wishlist.itemCount, 0) ?? 0;

  // Live preview: what the banner will look like once saved.
  const cover = resolveCover(coverImageBroken ? null : coverImage, coverPreset);

  const reset = () => {
    setName(user.name);
    setAvatar(user.avatar ?? "");
    setCoverPreset(user.coverPreset ?? "");
    setCoverImage(user.coverImage ?? "");
    setCoverImageBroken(false);
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
    { label: t("account.statJoined"), value: formatDate(user.createdAt) },
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

      {/* ------------------------------------------------- unsaved-change bar */}
      {dirty ? (
        <div className="bg-secondary/60 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
          <p className="text-sm">{t("account.unsaved")}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("account.undo")}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => profileMutation.mutate()}
              disabled={!name.trim() || profileMutation.isPending}
            >
              {profileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("account.save")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* -------------------------------------------------------- profile */}
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <BadgeCheck className="text-primary size-4" />
            <h2 className="text-sm font-semibold">{t("account.publicInfo")}</h2>
          </div>

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
            <Label htmlFor="avatar">{t("account.avatarUrl")}</Label>
            <Input
              id="avatar"
              value={avatar}
              onChange={(event) => setAvatar(event.target.value)}
              placeholder={t("account.avatarPlaceholder")}
            />
            <p className="text-muted-foreground text-xs">{t("account.avatarHint")}</p>
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
              <Label htmlFor="coverImage" className="text-xs font-normal">
                {t("account.coverCustom")}
              </Label>
              <Input
                id="coverImage"
                value={coverImage}
                onChange={(event) => {
                  setCoverImage(event.target.value);
                  setCoverImageBroken(false);
                }}
                placeholder={t("account.coverPlaceholder")}
                className="h-8 text-sm"
              />
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <ImageOff className="size-3" />
                {t("account.coverHint")}
              </p>
            </div>
          </div>

          <Separator />

          <div className="text-muted-foreground space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {t("account.emailFixed", { email: user.email })}
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {t("account.joinedAt", { date: formatDate(user.createdAt) })}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------- password */}
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" />
            <h2 className="text-sm font-semibold">{t("account.security")}</h2>
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
      </section>
    </div>
  );
}
