'use strict';

const fs = require('fs');
const path = require('path');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
const MAX_RECORDINGS = 20;

function ensureDir() {
  try {
    if (!fs.existsSync(RECORDINGS_DIR)) {
      fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create recordings dir:', err.message);
  }
}

function pruneRecordings(dir = RECORDINGS_DIR, maxFiles = MAX_RECORDINGS) {
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return { name: f, full, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxFiles) {
      for (const extra of files.slice(maxFiles)) {
        try {
          fs.unlinkSync(extra.full);
        } catch {
          // Ignore deletion error
        }
      }
    }
  } catch {
    // Ignore prune errors
  }
}

function saveRecording(recorder, dir = RECORDINGS_DIR) {
  try {
    if (!recorder || typeof recorder.toJSON !== 'function') return null;
    const data = recorder.toJSON();
    if (!data || !data.id) return null;

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, `${data.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    pruneRecordings(dir, MAX_RECORDINGS);
    return data.id;
  } catch (err) {
    console.error('Failed to save recording:', err.message);
    return null;
  }
}

function getRecording(id, dir = RECORDINGS_DIR) {
  try {
    if (typeof id !== 'string' || !/^[a-f0-9]{12}$/.test(id)) {
      return null;
    }
    const filePath = path.join(dir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    if (data && data.v === 1 && data.id === id) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  RECORDINGS_DIR,
  ensureDir,
  saveRecording,
  getRecording,
  pruneRecordings,
};
