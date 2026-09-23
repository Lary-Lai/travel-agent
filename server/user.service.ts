/** User + credential service (registration, login, profile). */
import bcrypt from "bcryptjs";

import { prisma } from "../lib/db";
import { conflict, unauthorized } from "../lib/http";
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
      // Deterministic avatar so new accounts look finished immediately.
      avatar: `https://i.pravatar.cc/160?u=${encodeURIComponent(email)}`,
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
