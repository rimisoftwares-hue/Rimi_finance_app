// pkg.config.js
module.exports = {
  entry: "index.js",          // ✅ MUST be "entry"
  output: "backend.exe",
  targets: ["node20-win-x64"],
  assets: [
    ".env",
    "node_modules/jimp/**/*",
    "node_modules/@jimp/**/*"
  ]
};
