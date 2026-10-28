'use strict';

const fs = require('fs');
const path = require('path');

const HACKATHONS_DIR = path.join(__dirname, '..', 'hackathons');

function ensureDir() {
  try {
    if (!fs.existsSync(HACKATHONS_DIR)) {
      fs.mkdirSync(HACKATHONS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create hackathons dir:', err.message);
  }
}

function sanitizeCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function saveHackathon(code, data, dir = HACKATHONS_DIR) {
  try {
    const safeCode = sanitizeCode(code);
    if (!safeCode || !data || typeof data !== 'object') return false;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, `${safeCode}.json`);
    const payload = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, payload, 'utf8');
    return true;
  } catch (err) {
    console.error(`Failed to save hackathon ${code}:`, err.message);
    return false;
  }
}

function loadHackathon(code, dir = HACKATHONS_DIR) {
  try {
    const safeCode = sanitizeCode(code);
    if (!safeCode) return null;

    const filePath = path.join(dir, `${safeCode}.json`);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    return data;
  } catch (err) {
    console.error(`Failed to load hackathon ${code}:`, err.message);
    return null;
  }
}

function deleteHackathon(code, dir = HACKATHONS_DIR) {
  try {
    const safeCode = sanitizeCode(code);
    if (!safeCode) return false;
    const filePath = path.join(dir, `${safeCode}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

ensureDir();

module.exports = {
  HACKATHONS_DIR,
  saveHackathon,
  loadHackathon,
  deleteHackathon,
  sanitizeCode,
};
