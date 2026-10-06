const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

function isMirror(directory) {
  return fs.existsSync(path.join(directory, "package.json")) &&
    fs.existsSync(path.join(directory, "js", "node_helper.js"));
}

function mirrorPath() {
  if (process.env.MAGICMIRROR_PATH) {
    const directory = path.resolve(process.env.MAGICMIRROR_PATH);
    if (!isMirror(directory)) throw new Error("MAGICMIRROR_PATH must point to the MagicMirror root folder.");
    return directory;
  }
  let directory = path.resolve(__dirname, "..");
  while (true) {
    if (isMirror(directory)) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Set MAGICMIRROR_PATH to run tests or the demo outside the MagicMirror installation. See the README.");
}

function mirrorRequire() {
  return createRequire(path.join(mirrorPath(), "package.json"));
}

module.exports = { mirrorPath, mirrorRequire };
