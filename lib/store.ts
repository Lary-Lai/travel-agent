/**
 * Client-side UI state (Zustand).
 *
 * TanStack Query owns server data; these stores hold only ephemeral UI state:
 * the Agent drawer, the locally cached "saved" set (so hearts update instantly),
 * and the in-progress search draft.
 */
import { create } from "zustand";

// --------------------------------------------------------------------- agent

type AgentState = {
  open: boolean;
  /** A prompt the Agent should auto-send when it next opens (used by CTA buttons). */
  pendingPrompt: string | null;
  /**
   * Conversation id, created lazily on first send. Kept here (rather than in a
   * ref during render) because Date.now/Math.random are impure and must not run
   * during render. Living in the store also means closing and reopening the
   * drawer continues the same conversation.
   */
  sessionId: string | null;
  ensureSessionId: () => string;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openWithPrompt: (prompt: string) => void;
  consumePrompt: () => string | null;
};

export const useAgentStore = create<AgentState>((set, get) => ({
  open: false,
  pendingPrompt: null,
  sessionId: null,
  ensureSessionId: () => {
    const existing = get().sessionId;
    if (existing) return existing;
    const created = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    set({ sessionId: created });
    return created;
  },
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  openWithPrompt: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => {
    const prompt = get().pendingPrompt;
    if (prompt) set({ pendingPrompt: null });
    return prompt;
  },
}));

// --------------------------------------------------------------------- saved

type SavedState = {
  ids: Set<string>;
  hydrated: boolean;
  setSaved: (ids: string[]) => void;
  markSaved: (id: string) => void;
  markRemoved: (id: string) => void;
  isSaved: (id: string) => boolean;
  reset: () => void;
};

export const useSavedStore = create<SavedState>((set, get) => ({
  ids: new Set<string>(),
  hydrated: false,
  // Always replace the Set instance so subscribers re-render.
  setSaved: (ids) => set({ ids: new Set(ids), hydrated: true }),
  markSaved: (id) => {
    const next = new Set(get().ids);
    next.add(id);
    set({ ids: next, hydrated: true });
  },
  markRemoved: (id) => {
    const next = new Set(get().ids);
    next.delete(id);
    set({ ids: next, hydrated: true });
  },
  isSaved: (id) => get().ids.has(id),
  reset: () => set({ ids: new Set<string>(), hydrated: false }),
}));

// -------------------------------------------------------------- search draft

export type SearchDraft = {
  destination: string;
  checkIn: string;
  checkOut: string;
  guests: number;
};

type SearchDraftState = SearchDraft & {
  setDraft: (patch: Partial<SearchDraft>) => void;
  resetDraft: () => void;
};

const initialDraft: SearchDraft = { destination: "", checkIn: "", checkOut: "", guests: 2 };

/**
 * Keeps the search bar's selection alive while the user navigates between the
 * homepage and the results page, so the widget never appears to reset.
 */
export const useSearchDraftStore = create<SearchDraftState>((set) => ({
  ...initialDraft,
  setDraft: (patch) => set(patch),
  resetDraft: () => set(initialDraft),
}));
