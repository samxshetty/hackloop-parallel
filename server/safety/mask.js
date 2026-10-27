'use strict';

const defaultPatterns = require('./patterns');

/**
 * Masks secrets in text by replacing each character of a secret with '•' (preserving newlines).
 * For key-value assignments, only the value is masked.
 *
 * @param {string} text - The input text to mask.
 * @param {Array<{name: string, regex: RegExp}>} [customPatterns]
 * @returns {{ text: string, count: number, kinds: string[] }}
 */
function maskSecrets(text, customPatterns) {
  if (typeof text !== 'string') {
    return { text: '', count: 0, kinds: [] };
  }
  if (text.length === 0) {
    return { text: '', count: 0, kinds: [] };
  }

  try {
    const patterns = customPatterns || defaultPatterns;
    const intervals = [];

    for (const p of patterns) {
      const regex = new RegExp(p.regex.source, p.regex.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex++;
          continue;
        }

        if (p.name === 'Secret Assignment') {
          // match[4] is quoted value, match[5] is unquoted value
          const val = match[4] !== undefined ? match[4] : match[5];
          if (val && val.length >= 6) {
            const opIdx = match[0].search(/[=:]/);
            const valOffset = match[0].indexOf(val, opIdx >= 0 ? opIdx : 0);
            if (valOffset >= 0) {
              const start = match.index + valOffset;
              const end = start + val.length;
              intervals.push({ start, end, name: p.name });
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

    if (intervals.length === 0) {
      return { text, count: 0, kinds: [] };
    }

    // Sort intervals by start index
    intervals.sort((a, b) => a.start - b.start || b.end - a.end);

    // Merge overlapping intervals
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

    // Build masked text preserving newlines
    let out = '';
    let lastIdx = 0;
    const allKinds = new Set();

    for (const item of merged) {
      out += text.slice(lastIdx, item.start);
      const secretChunk = text.slice(item.start, item.end);
      // Replace all non-newline characters with '•' (preserving \r and \n)
      out += secretChunk.replace(/[^\r\n]/g, '•');
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
    };
  } catch (err) {
    // Fully safe fallback
    return {
      text: typeof text === 'string' ? text : '',
      count: 0,
      kinds: [],
    };
  }
}

module.exports = {
  maskSecrets,
};
