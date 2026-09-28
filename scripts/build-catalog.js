#!/usr/bin/env node
// Regenerate catalog.json from this repo's releases.
//
//   node scripts/build-catalog.js > catalog.json
//
// Every release whose tag is <type>-<hardware>-v<version> contributes one
// entry. Each asset is downloaded and its header parsed: an entry is only
// emitted when the file's header agrees with its tag, and its sha256 is taken
// from the bytes actually downloaded. Draft releases are skipped; pre-releases
// become channel "beta". Atrium reads only this file — one download, no GitHub
// API calls from the field — so gateways never hit the API rate limit.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { parse, TAG_RE } = require("./ncd");

const REPO = process.env.FIRMWARE_REPO || process.env.GITHUB_REPOSITORY || "ncd-io/Sensor-Firmware";
const sensors = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "sensors.json"), "utf8"));

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const releases = JSON.parse(gh("api", "--paginate", "--slurp", `repos/${REPO}/releases?per_page=100`)).flat();

async function main() {
  const out = [];
  const problems = [];
  for (const r of releases) {
    const m = TAG_RE.exec(r.tag_name);
    if (!m || r.draft) continue;
    const asset = r.assets.find((a) => a.name === `${r.tag_name}.ncd`);
    if (!asset) { problems.push(`${r.tag_name}: no ${r.tag_name}.ncd asset`); continue; }
    const res = await fetch(asset.browser_download_url);
    if (!res.ok) { problems.push(`${r.tag_name}: download ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    let h;
    try { h = parse(buf); } catch (e) { problems.push(`${r.tag_name}: ${e.message}`); continue; }
    if (h.sensor_type !== +m[1] || h.hardware_id !== m[2] || h.version !== +m[3]) {
      problems.push(`${r.tag_name}: header says ${h.sensor_type}-${h.hardware_id}-v${h.version}`);
      continue;
    }
    const s = sensors[h.sensor_type] || {};
    out.push({
      id: r.tag_name,
      sensor_type: h.sensor_type,
      hardware_id: h.hardware_id,
      version: h.version,
      name: s.name || null,
      channel: r.prerelease ? "beta" : "stable",
      released: r.published_at,
      size: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      url: asset.browser_download_url,
      release_url: r.html_url,
      notes: r.body || "",
      warnings: s.warnings || [],
    });
  }
  out.sort((a, b) => a.sensor_type - b.sensor_type || a.hardware_id.localeCompare(b.hardware_id) || b.version - a.version);
  for (const p of problems) console.error(`skipped ${p}`);
  process.stdout.write(JSON.stringify({ schema: 1, generated: new Date().toISOString(), repo: REPO, firmware: out }, null, 2) + "\n");
  if (problems.length && process.env.STRICT) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
