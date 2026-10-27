'use strict';

const patterns = [
  {
    name: 'AWS Access Key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: 'OpenAI / Anthropic API Key',
    regex: /\bsk-(?:ant-|proj-)?[a-zA-Z0-9_\-]{20,}\b/g,
  },
  {
    name: 'Stripe API Key',
    regex: /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}\b/g,
  },
  {
    name: 'GitHub Token',
    regex: /\b(?:ghp_[a-zA-Z0-9]{16,}|gho_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{16,})\b/g,
  },
  {
    name: 'Google API Key',
    regex: /\bAIza[0-9A-Za-z\-_]{30,40}\b/g,
  },
  {
    name: 'Slack Token',
    regex: /\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b/g,
  },
  {
    name: 'JSON Web Token',
    regex: /\beyJ[a-zA-Z0-9_-]{8,}\.eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g,
  },
  {
    name: 'PEM Private Key',
    regex: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+)?PRIVATE KEY-----/g,
  },
  {
    name: 'Database URL',
    regex: /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"':@/]+:[^\s"':@/]+@[^\s"'/]+(?:\/[^\s"']*)?/g,
  },
  {
    name: 'Secret Assignment',
    // Matches password / secret / token / api_key / apikey = "value" or : 'value'
    // Value >= 6 chars, case-insensitive.
    regex: /(?:^|[\s,;{([`'"])\b(password|secret|token|api_key|apikey)\b\s*([=:])\s*(["'`])([^"'\r\n`]{6,})\3/gi,
  },
];

module.exports = patterns;
module.exports.patterns = patterns;
