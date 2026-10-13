/**
 * Itinerary limits, shared by the server, the agent tools and the UI.
 *
 * Lives outside `server/` because the client needs it too: the day stepper's upper bound
 * has to be the same number the service enforces, or the button offers a day the write
 * rejects. A validation rule duplicated in two places is a rule that will disagree.
 */
export const MAX_PLAN_DAY = 30;
