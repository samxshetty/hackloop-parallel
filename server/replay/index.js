'use strict';

const {
  createRecorder,
  recordSuggestion,
  recordSuggestionResult,
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
  RECORDINGS_DIR,
  ensureDir,
  saveRecording,
  getRecording,
  pruneRecordings,
};
