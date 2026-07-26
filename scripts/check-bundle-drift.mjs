/**
 * pretest gate: rebuild app.bundle.js and fail if committed bundle drifts from app.js + modules.
 * Usage: node scripts/check-bundle-drift.mjs
 * Exit 0 = in sync; 1 = drift or build failure.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "app.bundle.js");

function sha256(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

if (!fs.existsSync(bundlePath)) {
  console.error("[check-bundle-drift] missing app.bundle.js — run npm run build:bundle first");
  process.exit(1);
}

const before = sha256(bundlePath);
const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "esbuild",
    "app.js",
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--outfile=app.bundle.js",
    "--alias:punycode=punycode"
  ],
  { cwd: root, encoding: "utf8", shell: true }
);

if (r.status !== 0) {
  console.error("[check-bundle-drift] build:bundle failed");
  console.error(r.stdout || "");
  console.error(r.stderr || "");
  process.exit(1);
}

const after = sha256(bundlePath);
if (before !== after) {
  console.error("[check-bundle-drift] FAIL: app.bundle.js drifted from app.js");
  console.error("  before:", before);
  console.error("  after: ", after);
  console.error("  Commit the rebuilt app.bundle.js (npm run build:bundle).");
  // Leave the rebuilt file on disk so the developer can commit it.
  process.exit(1);
}

console.log("[check-bundle-drift] OK — app.bundle.js matches app.js (" + after.slice(0, 12) + "…)");
process.exit(0);
