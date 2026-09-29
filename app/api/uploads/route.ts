import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { badRequest, handler, ok } from "@/lib/http";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/lib/uploads";
import { UPLOAD_KINDS, type UploadKindValue } from "@/types";

export const runtime = "nodejs";

/** Uploads need a body bigger than the default, but still bounded. */
export const maxDuration = 30;

/**
 * POST /api/uploads
 *
 * Store one local image (multipart/form-data: `file` + `kind`) and return the
 * path to save on the profile.
 *
 * Requires a session: this writes to the server's disk, so it must not be an
 * open endpoint. The kind is validated against the known list rather than taken
 * as a free-form string, because it becomes part of the stored filename.
 */
export const POST = handler(async (request: NextRequest) => {
  await requireUser();

  const formData = await request.formData().catch(() => null);
  if (!formData) throw badRequest("请求格式不正确，应为 multipart/form-data");

  const file = formData.get("file");
  if (!(file instanceof File)) throw badRequest("请选择要上传的图片");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("图片过大，请上传 4MB 以内的图片");

  const kindInput = String(formData.get("kind") ?? "avatar");
  if (!(UPLOAD_KINDS as readonly string[]).includes(kindInput)) {
    throw badRequest("未知的上传类型");
  }

  const stored = await saveUpload({
    bytes: new Uint8Array(await file.arrayBuffer()),
    kind: kindInput as UploadKindValue,
  });

  return ok({
    url: stored.url,
    kind: kindInput as UploadKindValue,
    mimeType: stored.mimeType,
    bytes: stored.bytes,
    width: stored.width,
    height: stored.height,
  });
});
