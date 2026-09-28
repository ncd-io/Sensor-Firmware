#!/usr/bin/env node
// One-time import of ncd-io/Enterprise-Sensor-Firmware into releases.
//
//   node scripts/import-legacy.js <path to Enterprise-Sensor-Firmware checkout>          # plan only
//   node scripts/import-legacy.js <checkout> --publish                                    # create releases
//
// Identity comes from each file's header (sensor type, hardware id, version).
// Custom builds (_CF, Custom, MSN) are left out for now — they share a sensor
// type, hardware id and version with the standard build, and a sensor cannot
// tell us which one it runs. When two standard files claim the same identity,
// the one whose name agrees with its header wins, then the one named for its
// board (PRxx-…); the other is reported.
// Release notes are the matching "Vn -- …" lines from the folder's readme.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { parse, tagFor } = require("./ncd");

const root = process.argv[2];
const publish = process.argv.includes("--publish");
if (!root) { console.error("usage: import-legacy.js <Enterprise-Sensor-Firmware checkout> [--publish]"); process.exit(2); }
const base = path.join(root, "Firmware Files");
const VARIANT = /(_CF\b|_CF_|custom|_MSN)/i;

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ncd") ? [path.join(d, e.name)] : []);
}
function readme(dir) {
  const f = fs.readdirSync(dir).find((n) => /^read/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), "utf8") : "";
}
function notesFor(file, h) {
  const lines = readme(path.dirname(file)).split(/\r?\n/);
  const mine = lines.filter((l) => new RegExp(`^\\s*v${h.version}\\b`, "i").test(l)).map((l) => l.replace(/^\s*v\d+\s*-*\s*/i, "").trim()).filter(Boolean);
  const src = path.relative(root, file);
  return (mine.length ? mine.map((l) => `- ${l}`).join("\n") + "\n\n" : "") +
    `Imported from Enterprise-Sensor-Firmware (\`${src}\`).`;
}

const plan = new Map();
const excluded = [];
const conflicts = [];
for (const file of walk(base)) {
  const name = path.basename(file);
  let h;
  try { h = parse(fs.readFileSync(file)); } catch (e) { excluded.push([name, e.message]); continue; }
  if (VARIANT.test(name)) { excluded.push([path.relative(base, file), `custom build (${tagFor(h)})`]); continue; }
  const tag = tagFor(h);
  const sha = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const prev = plan.get(tag);
  if (!prev) { plan.set(tag, { tag, file, h, sha }); continue; }
  if (prev.sha === sha) continue; // identical copy
  // Prefer the file whose name agrees with its header, then the one named for
  // its board (PRxx-…).
  const score = (f) => {
    const v = /V(\d+)/i.exec(path.basename(f));
    return (v && +v[1] === h.version ? 2 : 0) + (/^PR\d+/i.test(path.basename(f)) ? 1 : 0);
  };
  const keep = score(file) > score(prev.file) ? { tag, file, h, sha } : prev;
  const drop = keep === prev ? file : prev.file;
  conflicts.push([tag, path.relative(base, keep.file), path.relative(base, drop)]);
  plan.set(tag, keep);
}

const rows = [...plan.values()].sort((a, b) => a.h.sensor_type - b.h.sensor_type || a.h.hardware_id.localeCompare(b.h.hardware_id) || a.h.version - b.h.version);
console.log(`# Legacy import plan — ${rows.length} releases\n`);
console.log("| Release tag | Source file | Name/header agree |");
console.log("|---|---|---|");
for (const r of rows) {
  const fnV = /V(\d+)/i.exec(path.basename(r.file));
  const agree = !fnV || +fnV[1] === r.h.version ? "yes" : `**no** — filename says V${fnV[1]}`;
  console.log(`| ${r.tag} | ${path.relative(base, r.file)} | ${agree} |`);
}
console.log(`\n## Same identity, different file (${conflicts.length}) — first listed is kept\n`);
for (const [t, k, d] of conflicts) console.log(`- ${t}: kept \`${k}\`, dropped \`${d}\``);
console.log(`\n## Not imported (${excluded.length})\n`);
for (const [f, why] of excluded) console.log(`- \`${f}\` — ${why}`);

if (publish) {
  for (const r of rows) {
    const nf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "notes-")), "notes.md");
    fs.writeFileSync(nf, notesFor(r.file, r.h));
    execFileSync("node", [path.join(__dirname, "publish.js"), r.file, "--notes", nf], { stdio: "inherit" });
  }
}
