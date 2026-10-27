'use strict';

const defaultPatterns = require('./patterns');

/**
 * Extracts masked intervals for a given text.
 * @param {string} text
 * @returns {Array<{start: number, end: number, kinds: Set<string>}>}
 */
function getMaskedIntervals(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const intervals = [];

  for (const p of defaultPatterns) {
    const regex = new RegExp(p.regex.source, p.regex.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      if (p.name === 'Secret Assignment') {
        const val = match[4];
        if (val && val.length >= 6) {
          const opIdx = match[0].search(/[=:]/);
          const valOffset = match[0].indexOf(val, opIdx >= 0 ? opIdx : 0);
          if (valOffset >= 0) {
            const start = match.index + valOffset;
            intervals.push({ start, end: start + val.length, name: p.name });
          }
        }
      } else {
        intervals.push({
          start: match.index,
          end: match.index + match[0].length,
          name: p.name,
        });
      }
    }
  }

  if (intervals.length === 0) return [];

  intervals.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged = [];
  for (const curr of intervals) {
    if (merged.length === 0) {
      merged.push({ start: curr.start, end: curr.end, kinds: new Set([curr.name]) });
    } else {
      const prev = merged[merged.length - 1];
      if (curr.start < prev.end) {
        prev.end = Math.max(prev.end, curr.end);
        prev.kinds.add(curr.name);
      } else {
        merged.push({ start: curr.start, end: curr.end, kinds: new Set([curr.name]) });
      }
    }
  }

  return merged;
}

/**
 * Converts character offset to 0-based line and character position.
 */
function offsetToPos(text, offset) {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastLineStart = i + 1;
    }
  }
  return { line, character: offset - lastLineStart };
}

/**
 * Checks whether a suggestion's range or content overlaps a masked region.
 * @param {object} s - Suggestion message
 * @param {string} text - Host document text
 * @returns {boolean}
 */
function isSuggestionMasked(s, text) {
  if (!s || typeof s !== 'object') return false;

  // If the suggestion itself contains bullets, it came from a masked view
  const str = JSON.stringify(s);
  if (str.includes('\u2022')) return true;

  if (typeof text !== 'string' || text.length === 0) return false;
  const intervals = getMaskedIntervals(text);
  if (intervals.length === 0) return false;

  // Check offset-based ranges if present
  if (typeof s.offset === 'number' || typeof s.start === 'number') {
    const start = s.offset ?? s.start;
    const length = s.length ?? (typeof s.text === 'string' ? s.text.length : 1);
    const end = s.end ?? (start + length);
    for (const iv of intervals) {
      if (start < iv.end && end > iv.start) return true;
    }
  }

  // Check line/character coordinates
  const range = s.range || s;
  const sStartLine = range.startLine ?? range.start?.line ?? s.line;
  const sEndLine = range.endLine ?? range.end?.line ?? sStartLine;
  const hasCharPos = (range.startCharacter !== undefined || range.startChar !== undefined || range.start?.character !== undefined || s.character !== undefined);
  const sStartChar = range.startCharacter ?? range.startChar ?? range.start?.character ?? s.character ?? 0;
  const sEndChar = range.endCharacter ?? range.endChar ?? range.end?.character ?? (sEndLine === sStartLine ? sStartChar + (typeof s.text === 'string' ? s.text.length : 1) : 0);

  if (typeof sStartLine === 'number') {
    for (const iv of intervals) {
      const mStart = offsetToPos(text, iv.start);
      const mEnd = offsetToPos(text, iv.end);

      // Line range completely disjoint
      if (sEndLine < mStart.line || sStartLine > mEnd.line) continue;

      // If column coordinates were not specified, any match on this line overlaps
      if (!hasCharPos) return true;

      // Same line with character coordinates specified
      if (sStartLine === mStart.line && sEndLine === mEnd.line) {
        if (sStartChar < mEnd.character && sEndChar > mStart.character) return true;
      } else {
        // Multi-line overlap
        return true;
      }
    }
  }

  return false;
}

/**
 * Masks secrets in text by replacing each character of a secret with '•' (preserving newlines).
 * For key-value assignments, only the value is masked.
 *
 * @param {string} text - The input text to mask.
 * @param {Array<{name: string, regex: RegExp}>} [customPatterns]
 * @returns {{ text: string, count: number, kinds: string[], spans: Array<{start: number, end: number}> }}
 */
function maskSecrets(text, customPatterns) {
  if (typeof text !== 'string') {
    return { text: '', count: 0, kinds: [], spans: [] };
  }
  if (text.length === 0) {
    return { text: '', count: 0, kinds: [], spans: [] };
  }

  try {
    const merged = getMaskedIntervals(text);
    if (merged.length === 0) {
      return { text, count: 0, kinds: [], spans: [] };
    }

    let out = '';
    let lastIdx = 0;
    const allKinds = new Set();
    const spans = [];

    for (const item of merged) {
      out += text.slice(lastIdx, item.start);
      const secretChunk = text.slice(item.start, item.end);
      out += secretChunk.replace(/[^\r\n]/g, '•');
      spans.push({ start: item.start, end: item.end });
      lastIdx = item.end;
      for (const k of item.kinds) {
        allKinds.add(k);
      }
    }
    out += text.slice(lastIdx);

    return {
      text: out,
      count: merged.length,
      kinds: Array.from(allKinds),
      spans,
    };
  } catch (err) {
    return {
      text: typeof text === 'string' ? text : '',
      count: 0,
      kinds: [],
      spans: [],
    };
  }
}

module.exports = {
  maskSecrets,
  getMaskedIntervals,
  isSuggestionMasked,
};
