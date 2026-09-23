/**
 * In-memory conversation state store.
 *
 * Holds only short-term referential memory (which listings were last shown) so
 * that "compare those three" / "add the first one" work. It is intentionally
 * process-local and bounded: this is demo-scale memory, not a persistence layer.
 * Nothing security-relevant is cached — ownership is always re-checked in the
 * database by the wishlist service.
 */
import type { AgentSessionState } from "./types";

const MAX_SESSIONS = 500;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const sessions = new Map<string, AgentSessionState>();

function evictStale(now: number) {
  for (const [key, value] of sessions) {
    if (now - value.updatedAt > TTL_MS) sessions.delete(key);
  }
  // Hard cap so a long-running dev server cannot grow without bound.
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function getSession(sessionId: string): AgentSessionState {
  const now = Date.now();
  const existing = sessions.get(sessionId);
  if (existing && now - existing.updatedAt <= TTL_MS) {
    return existing;
  }
  const fresh: AgentSessionState = { lastListingIds: [], lastQuerySummary: null, updatedAt: now };
  sessions.set(sessionId, fresh);
  evictStale(now);
  return fresh;
}

export function rememberListings(
  sessionId: string,
  listingIds: string[],
  querySummary: string | null,
): void {
  const session = getSession(sessionId);
  session.lastListingIds = listingIds;
  session.lastQuerySummary = querySummary;
  session.updatedAt = Date.now();
  sessions.set(sessionId, session);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}
