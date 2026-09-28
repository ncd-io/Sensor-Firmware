# NCD Sensor Firmware

Over-the-air firmware for NCD wireless sensors. Every build is a GitHub
release, and Atrium gateways install them from the **Update** tab of a
sensor's settings.

## How builds are identified

A sensor accepts firmware only for its own **sensor type** and **hardware ID**
(3 bytes, reported in its manifest and its check-in packet). The same board can
run several sensor types, and one sensor type can ship on several boards, so a
build is identified by all three:

```
<sensor_type>-<hardware_id>-v<version>      e.g. 114-633d00-v18
```

That string is the release tag and the asset name (`114-633d00-v18.ncd`). It is
read from the `.ncd` file's own header by `scripts/publish.js` — never typed by
hand, and never taken from the filename.

## Publishing a build

```bash
node scripts/publish.js PR63-3A_V18.ncd --notes notes.md            # stable
node scripts/publish.js PR63-3A_V19.ncd --notes notes.md --beta     # beta (pre-release)
node scripts/publish.js some.ncd --dry-run                          # just show the tag
```

Write the notes for the people installing it: what changed, what they will
notice, and anything they must do first. Warnings that apply to every build of a
sensor type (e.g. "disconnect the probe") belong in `sensors.json`, which
Atrium shows before an operator confirms.

Publishing a release runs `.github/workflows/catalog.yml`, which rebuilds
`catalog.json` and uploads it to the rolling **`catalog`** release. Gateways
read only that one file:

```
https://github.com/ncd-io/Sensor-Firmware/releases/download/catalog/catalog.json
```

— one download, no GitHub API calls from the field, so a site with many gateways
behind one address never hits the API rate limit. Editing or deleting a release
rebuilds the catalog too. To withdraw a bad build, delete its release.

## catalog.json

```json
{
  "schema": 1,
  "generated": "2026-09-28T20:00:00Z",
  "firmware": [
    {
      "id": "114-633d00-v18",
      "sensor_type": 114, "hardware_id": "633d00", "version": 18,
      "name": "Standalone Smart Vibration Sensor v4",
      "channel": "stable",
      "released": "2026-09-28T19:00:00Z",
      "size": 193583,
      "sha256": "7134a840…",
      "url": "https://github.com/ncd-io/Sensor-Firmware/releases/download/114-633d00-v18/114-633d00-v18.ncd",
      "release_url": "https://github.com/ncd-io/Sensor-Firmware/releases/tag/114-633d00-v18",
      "notes": "…release body…",
      "warnings": []
    }
  ]
}
```

`build-catalog.js` downloads every asset, checks its header against its tag and
records the sha256 of the actual bytes; Atrium refuses a download that does not
hash to it.

## Custom builds

Custom builds (the legacy `_CF`, `_Custom` and `_MSN` files) share a sensor type,
hardware ID and version with the standard build, and a sensor cannot say which
one it runs, so they are not published here yet.

## Importing the legacy repository

`scripts/import-legacy.js <Enterprise-Sensor-Firmware checkout>` prints the
import plan (`import-plan.md`); `--publish` creates the releases.
