'use strict';

/**
 * Computes common prefix and suffix between oldText and newText,
 * returning the replacement range in oldText and the replacement middle in newText.
 */
function getChangeRegion(oldText, newText) {
  let prefix = 0;
  const oldLen = oldText.length;
  const newLen = newText.length;

  while (prefix < oldLen && prefix < newLen && oldText[prefix] === newText[prefix]) {
    prefix++;
  }

  let oldSuffix = oldLen;
  let newSuffix = newLen;
  while (oldSuffix > prefix && newSuffix > prefix && oldText[oldSuffix - 1] === newText[newSuffix - 1]) {
    oldSuffix--;
    newSuffix--;
  }

  const suffix = oldLen - oldSuffix;
  return {
    prefix,
    suffix,
    oldStart: prefix,
    oldEnd: oldSuffix,
    newMiddle: newText.slice(prefix, newSuffix),
  };
}

/**
 * Returns true if [start, end] overlaps with span [span.start, span.end].
 * Edits strictly adjacent to span (e.g. end === span.start or start === span.end) do not overlap.
 */
function overlapsSpan(start, end, span) {
  if (start === end) {
    // Pure insertion: overlaps only if strictly inside the span
    return start > span.start && start < span.end;
  }
  // Replacement or deletion: overlaps if intervals intersect
  return start < span.end && end > span.start;
}

/**
 * Validates and applies a guest edit against lastMasked and lastRaw.
 *
 * @param {string} lastRaw - The server's true raw document.
 * @param {string} lastMasked - The masked view the guest saw.
 * @param {Array<{start: number, end: number}>} spans - Masked secret spans in lastMasked.
 * @param {string} newText - The new document text sent by the guest.
 * @returns {{ ok: true, rawNew: string, change: object } | { ok: false, error: string }}
 */
function reconcileGuestEdit(lastRaw, lastMasked, spans, newText) {
  if (typeof newText !== 'string') {
    return { ok: false, error: 'Invalid document text' };
  }

  // If there are no masked spans, guest can edit anywhere
  if (!spans || spans.length === 0) {
    return { ok: true, rawNew: newText, change: null };
  }

  const change = getChangeRegion(lastMasked || '', newText);

  // Check if the change region overlaps ANY masked span
  for (const span of spans) {
    if (overlapsSpan(change.oldStart, change.oldEnd, span)) {
      return {
        ok: false,
        error: "That value is hidden and can't be edited",
        change,
      };
    }
  }

  // Apply change to raw text at same prefix / suffix offsets
  const prefix = change.prefix;
  const suffix = change.suffix;
  const raw = lastRaw || '';
  const rawLen = raw.length;

  const rawPrefix = raw.slice(0, prefix);
  const rawSuffix = raw.slice(rawLen - suffix);
  const rawNew = rawPrefix + change.newMiddle + rawSuffix;

  return {
    ok: true,
    rawNew,
    change,
  };
}

module.exports = {
  getChangeRegion,
  overlapsSpan,
  reconcileGuestEdit,
};
