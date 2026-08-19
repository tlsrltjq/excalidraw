/**
 * Reads/writes the `?drawing=<uuid>` query parameter (see DECISIONS.md
 * D-006). Only ever touches `location.search` — never `location.hash`,
 * which stays reserved for the existing share/collaboration flows
 * (`#json=`, `#room=`, `#url=`) per AGENTS.md's URL/호환성 규칙.
 */
const PARAM = "drawing";

export const getDrawingIdFromUrl = (): string | null => {
  return new URLSearchParams(window.location.search).get(PARAM);
};

/**
 * Updates the URL to reflect the given drawing id without a full page
 * reload. Pass `null` to remove the param (e.g. when going back to the
 * Dashboard). Uses `pushState` so the browser back button steps through
 * opened drawings; callers that don't want a history entry (e.g. programmatic
 * redirects) can pass `replace: true`.
 */
export const setDrawingIdInUrl = (
  id: string | null,
  opts?: { replace?: boolean },
) => {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set(PARAM, id);
  } else {
    url.searchParams.delete(PARAM);
  }

  const method = opts?.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", url);
};
