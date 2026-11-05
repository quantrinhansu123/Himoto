const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Share only the dependency-free contract, not Next.js source or node_modules.
config.watchFolders = [path.resolve(__dirname, "../shared")];
module.exports = config;
