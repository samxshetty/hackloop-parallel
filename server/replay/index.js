'use strict';

const {
  createRecorder,
  recordSuggestion,
  recordSuggestionResult,
  getSummary,
} = require('./recorder');

const {
  RECORDINGS_DIR,
  ensureDir,
  saveRecording,
  getRecording,
  pruneRecordings,
} = require('./storage');

module.exports = {
  createRecorder,
  recordSuggestion,
  recordSuggestionResult,
  getSummary,
  RECORDINGS_DIR,
  ensureDir,
  saveRecording,
  getRecording,
  pruneRecordings,
};
