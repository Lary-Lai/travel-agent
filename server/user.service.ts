/** User + credential service (registration, login, profile). */
import bcrypt from "bcryptjs";

import { presetAvatarFor, isPresetAvatar } from "../lib/avatars";
import { prisma } from "../lib/db";
import { badRequest, conflict, unauthorized } from "../lib/http";
import { isCoverPreset, MAX_CHIPS, normaliseChips } from "../lib/profile-options";
import { isUploadedMediaPath } from "../lib/uploads";
import type { NotificationTypeValue, ProfileVisibilityValue, SessionUserDto } from "../types";

/** bcrypt cost. 10 is the usual balance of safety and login latency. */
const BCRYPT_ROUNDS = 10;

/** Everything the session/user DTO exposes. Kept in one place so every query
 * projects the same columns — adding a field to the profile means touching this
 * type and `toDto`, not four `select` blocks. */
const userSelect = {
  id: true,
  email: true,
  name: true,
  avatar: true,
  createdAt: true,
  coverPreset: true,
  coverImage: true,
  tags: true,
  dreamDestinations: true,
  hobbies: true,
  visitedPlaces: true,
  profileVisibility: true,
  mutedNotificationTypes: true,
} as const;

type SelectedUser = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  createdAt: Date;
  coverPreset: string | null;
  coverImage: string | null;
  tags: string[];
  dreamDestinations: string[];
  hobbies: string[];
  visitedPlaces: string[];
  profileVisibility: ProfileVisibilityValue;
  mutedNotificationTypes: NotificationTypeValue[];
};

const toDto = (user: SelectedUser): SessionUserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar: user.avatar,
  createdAt: user.createdAt.toISOString(),
  coverPreset: user.coverPreset,
  coverImage: user.coverImage,
  tags: user.tags,
  dreamDestinations: user.dreamDestinations,
  hobbies: user.hobbies,
  visitedPlaces: user.visitedPlaces,
  profileVisibility: user.profileVisibility,
  mutedNotificationTypes: user.mutedNotificationTypes,
});

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<SessionUserDto> {
  const email = normaliseEmail(input.email);
  const name = input.name.trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw conflict("该邮箱已被注册，请直接登录");

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      // Deterministic bundled avatar so new accounts look finished immediately.
      avatar: presetAvatarFor(email),
    },
    select: userSelect,
  });

  return toDto(user);
}

/**
 * Verify a credential pair.
 * The same generic error is returned for an unknown email and a wrong password
 * so the endpoint cannot be used to enumerate registered accounts.
 */
export async function verifyCredentials(
  emailInput: string,
  password: string,
): Promise<SessionUserDto> {
  const email = normaliseEmail(emailInput);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...userSelect, password: true },
  });

  if (!user) throw unauthorized("邮箱或密码不正确");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw unauthorized("邮箱或密码不正确");

  // `toDto` maps field by field and never copies `password`, so the credential
  // cannot reach the DTO even though we hand it the row that contains the hash.
  return toDto(user);
}

export async function getUserById(id: string): Promise<SessionUserDto | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? toDto(user) : null;
}

/**
 * Update the editable parts of a profile.
 *
 * The email is deliberately NOT editable here: it identifies the account and is
 * used for login, so changing it would need a verification flow.
 *
 * Every personalisation field is optional and, when omitted, is left untouched —
 * so the editor can save one section without clearing the others.
 */
export async function updateProfile(
  userId: string,
  input: {
    /** Omitted when the caller is saving a different section. */
    name?: string;
    avatar?: string | null;
    coverPreset?: string | null;
    coverImage?: string | null;
    tags?: string[];
    dreamDestinations?: string[];
    hobbies?: string[];
    visitedPlaces?: string[];
    mutedNotificationTypes?: NotificationTypeValue[];
  },
): Promise<SessionUserDto> {
  const name = input.name?.trim();
  if (name !== undefined) {
    if (name.length === 0) throw badRequest("昵称不能为空");
    if (name.length > 40) throw badRequest("昵称不能超过 40 个字符");
  }

  // `undefined` means "the caller did not send this field" — leave the stored
  // value untouched. `null`/"" means "clear it". The editor saves in sections,
  // so a request that only edits hobbies must not wipe the banner.
  //
  // Three shapes are accepted: a bundled preset avatar, an uploaded file served
  // from `/api/media/...`, or an absolute http(s) URL (a profile that was filled
  // in before uploads existed still has to render).
  const avatar = input.avatar === undefined ? undefined : input.avatar?.trim() || null;
  if (
    avatar &&
    !isPresetAvatar(avatar) &&
    !isUploadedMediaPath(avatar) &&
    !/^https?:\/\//i.test(avatar)
  ) {
    throw badRequest("头像必须是内置预设、本地上传的图片，或有效的图片链接");
  }

  const coverImage = input.coverImage === undefined ? undefined : input.coverImage?.trim() || null;
  if (coverImage && !isUploadedMediaPath(coverImage) && !/^https?:\/\//i.test(coverImage)) {
    throw badRequest("背景图必须是本地上传的图片，或以 http:// 或 https:// 开头的链接");
  }

  if (input.coverPreset && !isCoverPreset(input.coverPreset)) {
    throw badRequest("未知的背景预设");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      avatar,
      coverImage,
      coverPreset: input.coverPreset,
      tags: input.tags && normaliseChips(input.tags, MAX_CHIPS.tags),
      dreamDestinations:
        input.dreamDestinations &&
        normaliseChips(input.dreamDestinations, MAX_CHIPS.dreamDestinations),
      hobbies: input.hobbies && normaliseChips(input.hobbies, MAX_CHIPS.hobbies),
      visitedPlaces:
        input.visitedPlaces && normaliseChips(input.visitedPlaces, MAX_CHIPS.visitedPlaces),
      // De-duplicated: the UI sends a set, but the API is a public entry point and
      // a repeated value would be stored as-is.
      mutedNotificationTypes: input.mutedNotificationTypes && [
        ...new Set(input.mutedNotificationTypes),
      ],
    },
    select: userSelect,
  });

  return toDto(user);
}

/**
 * Change the password.
 *
 * Requires the current password so a stolen session cookie alone cannot lock
 * the real owner out of their account.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) throw unauthorized("账号不存在，请重新登录");

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw badRequest("当前密码不正确");

  if (currentPassword === newPassword) throw badRequest("新密码不能与当前密码相同");

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });
}

/**
 * Change the address the account signs in with.
 *
 * Requires the current password, for the same reason as `changePassword`: a
 * stolen session cookie must not be enough to move the account to an address the
 * thief controls, which would otherwise be a silent takeover — the real owner
 * would simply stop being able to log in.
 *
 * Addresses are compared and stored lower-cased, matching how registration and
 * login normalise them; without that, `A@b.com` and `a@b.com` would be two
 * different accounts.
 */
export async function changeEmail(
  userId: string,
  currentPassword: string,
  newEmail: string,
): Promise<SessionUserDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  });
  if (!user) throw unauthorized("账号不存在，请重新登录");

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) throw badRequest("当前密码不正确");

  const email = newEmail.trim().toLowerCase();
  if (email === user.email.toLowerCase()) {
    throw badRequest("新邮箱与当前邮箱相同");
  }

  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) throw conflict("该邮箱已被注册");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { email },
    select: userSelect,
  });

  return toDto(updated);
}
