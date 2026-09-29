import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getPrivacySettings, savePrivacySettings } from "@/server/social.service";
import { PROFILE_VISIBILITIES } from "@/types";

/**
 * The two exception lists are ids only: names and avatars are hydrated by the
 * service from the database, so a client cannot put a label of its own choosing
 * next to a user id.
 */
const privacySchema = z.object({
  visibility: z.enum(PROFILE_VISIBILITIES),
  allow: z.array(z.string().trim().min(1)).max(200).default([]),
  deny: z.array(z.string().trim().min(1)).max(200).default([]),
});

/** GET /api/users/me/privacy — the caller's own visibility settings. */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok(await getPrivacySettings(user.id));
});

/**
 * PUT /api/users/me/privacy — replace the mode and both exception lists.
 *
 * Idempotent by design: the body carries the complete lists, so saving twice
 * with the same input leaves exactly the same rows.
 */
export const PUT = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const input = privacySchema.parse(body);

  return ok(await savePrivacySettings(user.id, input));
});
