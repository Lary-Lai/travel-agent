/** User + credential service (registration, login, profile). */
import bcrypt from "bcryptjs";

import { presetAvatarFor } from "../lib/avatars";
import { prisma } from "../lib/db";
import { badRequest, conflict, unauthorized } from "../lib/http";
import type { SessionUserDto } from "../types";

/** bcrypt cost. 10 is the usual balance of safety and login latency. */
const BCRYPT_ROUNDS = 10;

const toDto = (user: {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  createdAt: Date;
}): SessionUserDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar: user.avatar,
  createdAt: user.createdAt.toISOString(),
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
    select: { id: true, email: true, name: true, avatar: true, createdAt: true },
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
    select: { id: true, email: true, name: true, avatar: true, createdAt: true, password: true },
  });

  if (!user) throw unauthorized("邮箱或密码不正确");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw unauthorized("邮箱或密码不正确");

  // Project explicitly rather than destructuring the hash away, so the DTO can
  // never accidentally carry a credential field.
  return toDto({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    createdAt: user.createdAt,
  });
}

export async function getUserById(id: string): Promise<SessionUserDto | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, avatar: true, createdAt: true },
  });
  return user ? toDto(user) : null;
}

/**
 * Update the editable parts of a profile.
 * The email is deliberately NOT editable here: it identifies the account and is
 * used for login, so changing it would need a verification flow.
 */
export async function updateProfile(
  userId: string,
  input: { name: string; avatar?: string | null },
): Promise<SessionUserDto> {
  const name = input.name.trim();
  if (name.length === 0) throw badRequest("昵称不能为空");
  if (name.length > 40) throw badRequest("昵称不能超过 40 个字符");

  const avatar = input.avatar?.trim() ?? null;
  if (avatar && !/^https?:\/\//i.test(avatar)) {
    throw badRequest("头像地址必须以 http:// 或 https:// 开头");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name, avatar: avatar || null },
    select: { id: true, email: true, name: true, avatar: true, createdAt: true },
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
