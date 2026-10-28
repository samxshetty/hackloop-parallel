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
};
