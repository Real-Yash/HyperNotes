// Metro config kept minimal — Expo uses Metro by default.
// Kept for explicitness so EAS builds never guess config.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
