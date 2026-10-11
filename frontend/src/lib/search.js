import { useDeferredValue } from "react";

// Shared, forgiving search used by every search box in the app.
//
// Punctuation, dashes, commas, extra spaces, accents and case never decide
// whether something matches: "absl -spl", "ABSL, SPL" and "absl spl" all find
// "ABSL - SPL Campaign". Every word typed must appear somewhere in the item
// (in any order), either inside a word or across a word boundary.

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchTokens(query) {
  const text = normalizeText(query);
  return text ? text.split(" ") : [];
}

// Build a matcher once per query, then call it per row with the row's text
// fields: `const match = makeMatcher(q); rows.filter((r) => match(r.name, r.code))`.
// An empty query matches everything.
export function makeMatcher(query) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return () => true;

  return (...fields) => {
    const haystack = normalizeText(fields.flat(Infinity).filter(Boolean).join(" "));
    if (!haystack) return false;
    const compact = haystack.replace(/ /g, "");
    return tokens.every((t) => haystack.includes(t) || compact.includes(t));
  };
}

// `pending` is true while the list on screen is still catching up with what
// was typed (or data the search needs is still loading), so pages can show a
// loading state instead of a premature "no results".
export function useSearchPending(search, extraPending = false) {
  const deferred = useDeferredValue(search);
  return {
    deferred,
    pending: deferred !== search || (Boolean(search?.trim()) && extraPending),
  };
}
