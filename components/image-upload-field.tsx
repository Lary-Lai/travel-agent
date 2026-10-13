"use client";

/**
 * Pick an image from this device and upload it.
 *
 * Replaces the old "paste an image URL" inputs. Two reasons that is a better
 * default: a URL field asks the user to already be hosting the file somewhere,
 * and it lets the profile depend on a third-party host that can start answering
 * 403 (which is exactly how the old preset-avatar service died).
 *
 * Validation runs **before** the request, so the common mistakes ("that is a
 * 12 MB HEIC", "that is a PDF") produce an immediate, translated message instead
 * of a round-trip and a Chinese server string.
 */
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { api, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UploadKindValue } from "@/types";

/** Mirrors `MAX_UPLOAD_BYTES` on the server; keeping it here saves a round-trip. */
const MAX_BYTES = 4 * 1024 * 1024;
/** SVG is excluded deliberately — see the note in `lib/uploads.ts`. */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ImageUploadField({
  kind,
  value,
  onChange,
  label,
  disabled,
  className,
  previewClassName,
}: {
  kind: UploadKindValue;
  /** Current stored path/URL, or empty. */
  value: string;
  onChange: (next: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  previewClassName?: string;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /** Object URL of the picked file, shown while the upload is in flight. */
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error(t("account.uploadWrongType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("account.uploadTooLarge"));
      return;
    }

    setPendingPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const uploaded = await api.uploadImage(file, kind);
      onChange(uploaded.url);
      toast.success(t("account.uploadDone"));
    } catch (error) {
      // The server is the authority on what it accepted; surface its reason.
      toast.error(
        error instanceof ApiClientError ? error.message : t("account.uploadFailed"),
      );
    } finally {
      setUploading(false);
      setPendingPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      // Allow re-picking the same file after an error.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const shown = pendingPreview ?? (value || null);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "bg-muted relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
            previewClassName,
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="text-muted-foreground size-5" />
          )}
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-4 animate-spin text-white" />
            </span>
          ) : null}
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pick}
              disabled={disabled || uploading}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {uploading ? t("account.uploading") : label}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={disabled || uploading}
                className="text-muted-foreground hover:text-destructive gap-1"
              >
                <X className="size-3.5" />
                {t("account.removeImage")}
              </Button>
            ) : null}
          </div>
          {/*
            The "JPG / PNG / WebP / GIF, max 4MB, no SVG" line was removed here, which
            removes it from both callers (avatar and cover) — that is the point, since it
            was asked to go from both.

            The limits still exist and are still enforced; they are simply not recited up
            front. `account.uploadHint` is now unused, and the field reports a rejected
            file through its own error text (`uploadWrongType` / `uploadTooLarge`), which
            is where the information is actually needed.
          */}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
