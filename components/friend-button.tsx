"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, UserCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { api, ApiClientError } from "@/lib/api";
import type { FriendRelationValue } from "@/types";

/**
 * The friend affordance on someone else's profile.
 *
 * The relation (and, for a pending request, its row id) comes from the profile
 * read, so this component never guesses the state — it renders the one action
 * that makes sense for what the server said. Every mutation invalidates the
 * queries it touches, because the row the server stores is the truth: a click
 * must not leave the button showing a state the database does not have.
 */
export function FriendButton({
  userId,
  relation,
  requestId,
  className,
}: {
  userId: string;
  relation: FriendRelationValue;
  requestId: string | null;
  className?: string;
}) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const pathname = usePathname();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["public-profile", userId] });
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
  };

  const failed = (error: unknown) =>
    toast.error(error instanceof ApiClientError ? error.message : t("social.actionFailed"));

  const send = useMutation({
    mutationFn: () => api.sendFriendRequest(userId),
    onSuccess: (result) => {
      // Asking someone who had already asked you accepts their request, so the
      // toast follows the server's answer rather than the click.
      if (result.friend.relation === "FRIEND") {
        toast.success(t("social.friendRequestAccepted"));
      } else {
        toast.success(t("social.requestSent"));
      }
      invalidate();
    },
    onError: failed,
  });

  const respond = useMutation({
    mutationFn: (action: "accept" | "decline") =>
      api.respondToFriendRequest(requestId ?? "", action),
    onSuccess: (_result, action) => {
      toast.success(
        action === "accept" ? t("social.friendRequestAccepted") : t("social.friendRequestDeclined"),
      );
      invalidate();
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: () => api.removeFriend(requestId ?? ""),
    onSuccess: () => {
      toast.success(t("social.friendRemoved"));
      invalidate();
    },
    onError: failed,
  });

  // Your own profile has no friendship to offer — and rendering a disabled
  // "add yourself" button would be worse than rendering nothing.
  if (relation === "SELF") return null;

  // Signed out: there is no session user to send *from*, so the honest
  // affordance is the sign-in link rather than a button that 401s.
  if (!user) {
    return (
      <Button asChild variant="outline" className={className}>
        <Link href={`/login?redirect=${encodeURIComponent(pathname)}`}>
          <UserPlus className="size-4" />
          {t("social.loginToAddFriend")}
        </Link>
      </Button>
    );
  }

  const pending = send.isPending || respond.isPending || remove.isPending;

  if (relation === "FRIEND") {
    return (
      <Button
        variant="secondary"
        className={className}
        title={t("social.removeFriendHint")}
        disabled={pending || !requestId}
        onClick={() => remove.mutate()}
      >
        <UserCheck className="size-4" />
        {t("social.friends")}
      </Button>
    );
  }

  if (relation === "REQUEST_SENT") {
    return (
      <Button
        variant="outline"
        className={className}
        title={t("social.cancelRequestHint")}
        disabled={pending || !requestId}
        onClick={() => remove.mutate()}
      >
        <Clock className="size-4" />
        {t("social.requestPending")}
      </Button>
    );
  }

  if (relation === "REQUEST_RECEIVED") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className={className}
          disabled={pending || !requestId}
          onClick={() => respond.mutate("accept")}
        >
          <Check className="size-4" />
          {t("social.accept")}
        </Button>
        <Button
          variant="ghost"
          disabled={pending || !requestId}
          onClick={() => respond.mutate("decline")}
        >
          <X className="size-4" />
          {t("social.decline")}
        </Button>
      </div>
    );
  }

  return (
    <Button className={className} disabled={pending} onClick={() => send.mutate()}>
      <UserPlus className="size-4" />
      {t("social.addFriend")}
    </Button>
  );
}
