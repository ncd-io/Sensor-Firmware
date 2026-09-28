#!/usr/bin/env node
// Publish one firmware build as a GitHub release.
//
//   node scripts/publish.js <file.ncd> --notes notes.md [--beta] [--dry-run]
//
// The tag, title and asset name all come from the file's own header, never its
// filename (the legacy repo had files whose names disagreed with their header),
// so a build cannot be published under the wrong sensor, board or version.
// --beta publishes a GitHub pre-release, which Atrium shows as a beta build.
// The release workflow then regenerates catalog.json.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { parse, tagFor } = require("./ncd");

const REPO = process.env.FIRMWARE_REPO || "ncd-io/Sensor-Firmware";
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a) => a.endsWith(".ncd"));
if (!file) { console.error("usage: publish.js <file.ncd> --notes notes.md [--beta] [--dry-run]"); process.exit(2); }

const sensors = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "sensors.json"), "utf8"));
const h = parse(fs.readFileSync(file));
const tag = tagFor(h);
const name = (sensors[h.sensor_type] && sensors[h.sensor_type].name) || `Sensor type ${h.sensor_type}`;
const title = `${h.sensor_type} ${name} — V${h.version} (hardware ${h.hardware_id})`;
const notesFile = opt("--notes");
if (!notesFile && !flag("--dry-run")) { console.error("--notes <file.md> is required: every release needs a changelog"); process.exit(2); }

console.log(`tag:    ${tag}`);
console.log(`title:  ${title}`);
console.log(`beta:   ${flag("--beta")}`);
console.log(`image:  ${h.image_size} bytes (sensor max ${h.max_image_size})`);
if (flag("--dry-run")) process.exit(0);

// Asset is renamed to the tag so its URL says what it is.
const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fw-")), `${tag}.ncd`);
fs.copyFileSync(file, staged);
const gh = ["release", "create", tag, staged, "--repo", REPO, "--title", title, "--notes-file", notesFile, "--latest=false"];
if (flag("--beta")) gh.push("--prerelease");
execFileSync("gh", gh, { stdio: "inherit" });
