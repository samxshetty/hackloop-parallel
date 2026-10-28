'use strict';

const storage = require('./storage');
const store = require('./store');
const recommendations = require('./recommendations');

module.exports = {
  ...storage,
  ...store,
  ...recommendations,
};
