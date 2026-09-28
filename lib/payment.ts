/**
 * Payment-window constants, shared by the server and the checkout UI.
 *
 * These live outside `server/booking.service.ts` on purpose: the service imports
 * Prisma, so a client component that imported the constant from there would drag
 * the database client into the browser bundle. Keeping the number here gives both
 * sides one source of truth — the earlier alternative, re-deriving the window in
 * the UI as `paymentDueAt - createdAt`, quietly produced "1 minute" whenever the
 * deadline had been moved, because it read a mutable field instead of the rule.
 */

/** How long a PENDING hold survives before it is auto-cancelled. */
export const PAYMENT_WINDOW_MINUTES = 30;

export const PAYMENT_WINDOW_MS = PAYMENT_WINDOW_MINUTES * 60 * 1000;
