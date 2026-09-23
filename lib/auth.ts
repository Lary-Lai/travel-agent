/**
 * Session handling.
 *
 * A signed JWT (HS256, `jose`) stored in an HttpOnly cookie. Chosen over
 * Auth.js because the Agent must resolve the *server-side* user identity inside
 * a Route Handler without any client-supplied user id, and this keeps that
 * path explicit and audit-friendly. The brief explicitly allows either.
 *
 * Security properties:
 *  - the cookie is HttpOnly + SameSite=Lax (and Secure in production)
 *  - the payload carries only the user id; roles/ownership are re-checked in
 *    the database on every request, so a stale token cannot escalate access
 *  - the token is verified with a pinned algorithm to prevent alg confusion
 */
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { presetAvatarFor } from "./avatars";
import { unauthorized } from "./http";
import { getUserById } from "../server/user.service";
import type { SessionUserDto } from "../types";

export const SESSION_COOKIE = "ta_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short. Set it in .env (see .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Verify the cookie and return the user id, or null when absent/invalid. */
export async function readSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    // Expired or tampered with — treat as logged out.
    return null;
  }
}

/**
 * Issue the session cookie.
 * Only valid inside a Route Handler or Server Action — Next forbids cookie
 * writes during a Server Component render.
 */
export async function setSessionCookie(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the session cookie.
 * Always re-reads the user from the database so a deleted account cannot keep
 * using a still-valid token.
 */
export async function getCurrentUser(): Promise<SessionUserDto | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;

  // Delegated so the DTO shape lives in exactly one place: duplicating the
  // select/mapping here is how fields silently go missing from a session.
  return getUserById(userId);
}

/** Same as getCurrentUser but throws a 401 ApiError when signed out. */
export async function requireUser(): Promise<SessionUserDto> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** A stable placeholder avatar derived from the user id (bundled preset). */
export function avatarFor(user: { id: string; name: string }): string {
  return presetAvatarFor(user.id);
}
