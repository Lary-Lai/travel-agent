"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Makes a Radix dropdown open on hover, and survive the trip into its own menu.
 *
 * Three menus share this: the account menu, the language picker and the theme
 * picker. Each of the behaviours below was found the hard way, so they live in
 * one place instead of three copies.
 *
 * ## Usage
 *
 * ```tsx
 * const menu = useHoverMenu();
 * <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
 *   <DropdownMenuTrigger asChild>
 *     <Button {...menu.triggerProps}>…</Button>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent {...menu.contentProps}>
 *     <DropdownMenuItem onSelect={() => { doTheThing(); menu.closeNow(); }} />
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * **`modal={false}` is required on the `DropdownMenu`.** Radix is modal by
 * default, and a modal menu sets `pointer-events: none` on the rest of the page
 * while it is open. That breaks a hover-triggered menu in a loop: the trigger
 * stops receiving pointer events, the browser fires `pointerleave`, the delayed
 * close fires, the menu closes, pointer events return, `pointerenter` fires again
 * and it reopens — measured as `body.pointer-events` cycling none/none/auto on a
 * ~300ms period, which a user sees as the menu flickering. Non-modal is also the
 * correct semantics: a hover menu must leave the rest of the page live, so that
 * moving the pointer elsewhere behaves like moving a pointer, not like dismissing
 * a modal.
 */

/**
 * How long the pointer may be away from both the trigger and the menu before the
 * menu closes.
 *
 * This delay is the whole trick of a hover card. The content is portalled to the
 * body and offset from the trigger, so travelling between them briefly leaves
 * both — closing on the first `pointerleave` would make the menu unreachable.
 * 250ms is long enough for that trip and short enough not to feel sticky.
 *
 * (A "bridge" element — transparent padding spanning the gap — is the other
 * common fix, but it cannot work with a portal: a padding div inside the trigger
 * is not an ancestor of the menu and never receives the pointer. The 4px offset
 * takes ~10ms to cross at normal pointer speed, which this covers by a wide
 * margin.)
 */
const HOVER_CLOSE_DELAY = 250;

export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);
  const lastPointerType = useRef<string>("mouse");
  /** Set when the close is intentional (an item was chosen, or Escape), not hover. */
  const bypassHoverGuard = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback(
    (pointerType: string) => {
      lastPointerType.current = pointerType;
      cancelClose();
      setOpen(true);
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  }, [cancelClose]);

  // A pending timer must not fire after unmount.
  useEffect(() => cancelClose, [cancelClose]);

  /**
   * Radix asks to close for several different reasons, and only *some* of them
   * should be honoured while the pointer is still on the menu.
   *
   * A mouse click on the trigger would otherwise toggle a hover-opened menu shut
   * and leave it shut, because no new `pointerenter` fires while the pointer has
   * not moved. So a close request that arrives while the pointer is inside is
   * ignored — for mouse users, the pointer leaving is what closes it. Escape and
   * item selection bypass that via `contentProps`/`closeNow`.
   *
   * `hovering` is a ref rather than state because it is read inside this handler
   * and decides an outcome; as state it would be a stale closure.
   */
  const onOpenChange = useCallback(
    (next: boolean) => {
      cancelClose();
      if (!next && hovering.current && lastPointerType.current === "mouse" && !bypassHoverGuard.current) {
        return;
      }
      bypassHoverGuard.current = false;
      setOpen(next);
    },
    [cancelClose],
  );

  /** Close for real — call before navigating or applying an item's action. */
  const closeNow = useCallback(() => {
    bypassHoverGuard.current = true;
    setOpen(false);
  }, []);

  /** For the trigger element: hovering it opens the menu. */
  const triggerProps = {
    onPointerEnter: (event: React.PointerEvent) => {
      hovering.current = true;
      openNow(event.pointerType);
    },
    onPointerLeave: () => {
      hovering.current = false;
      scheduleClose();
    },
    /**
     * Marks this interaction as a keyboard one, so the menu may hand focus back on close
     * (see `onCloseAutoFocus`). Hovering never fires this, so anything not marked here
     * counts as pointer-initiated.
     */
    onKeyDown: () => {
      lastPointerType.current = "keyboard";
    },
  };

  /**
   * For `DropdownMenuContent`. It needs its own handlers because it is portalled
   * out of the trigger's subtree, so entering it would otherwise look like
   * leaving the trigger.
   */
  const contentProps = {
    ...triggerProps,
    /**
     * Escape is an explicit "close this" from the keyboard, so it must not be
     * vetoed by the hover guard — otherwise a keyboard user whose pointer happens
     * to rest on the trigger cannot close the menu at all. Radix calls this
     * before it requests the close.
     */
    onEscapeKeyDown: () => {
      bypassHoverGuard.current = true;
    },
    /**
     * Do not take focus back for a menu the pointer opened.
     *
     * Radix returns focus to the trigger when its menu closes, and a *programmatic* focus
     * matches `:focus-visible` in Chrome even though no key was pressed. So merely
     * hovering the avatar and moving away left the button focused with its focus ring
     * painted. Measured: at rest `boxShadow: none`; after a hover-and-leave
     * `matches(':focus-visible') === true` with the coral ring visible; after a pointer
     * *click* nothing — which is why the ring looked like it appeared for no reason. That
     * is the "red circle around the avatar even when nothing is hovered" a user reported.
     *
     * Suppressing the default only for pointer-initiated opens is the honest fix rather
     * than deleting the ring: a keyboard user who tabs to the avatar still gets focus
     * returned and the ring, because `onKeyDown` marks the interaction as keyboard. The
     * ring was never wrong to exist — it was firing for the wrong input.
     */
    onCloseAutoFocus: (event: Event) => {
      if (lastPointerType.current !== "keyboard") event.preventDefault();
    },
  };

  return { open, onOpenChange, closeNow, triggerProps, contentProps };
}
