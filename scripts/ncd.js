// .ncd firmware file header, as the sensor bootloader reads it:
//   [0x01][manifest_size u32 = 37][manifest(37)][0x02][image_length u32][image]
// manifest: version u8, start u32, image_size u32, max_image_size u32,
//           digest[16], device_type u16, hardware_id[3], reserve[3]
// Mirrors lib/FirmwareUpdate.js parseFirmwareFile in node-red-enterprise-sensors;
// kept standalone so this repo's tooling has no dependencies.
"use strict";

const be = (b) => b.reduce((n, x) => n * 256 + x, 0);
const hex = (b) => Array.from(b, (x) => ("0" + x.toString(16)).slice(-2)).join("");

function parse(buf) {
  const b = Array.from(buf);
  if (b.length < 47 || b[0] !== 1) throw new Error("not an .ncd firmware file (no manifest marker)");
  const size = be(b.slice(1, 5));
  if (size !== 37) throw new Error(`unexpected manifest size ${size}`);
  const m = b.slice(5, 42);
  if (b[42] !== 2) throw new Error("no image marker");
  const imageLength = be(b.slice(43, 47));
  if (b.length - 47 !== imageLength) throw new Error(`image truncated: header says ${imageLength} bytes, file has ${b.length - 47}`);
  if (be(m.slice(5, 9)) !== imageLength) throw new Error("manifest image size does not match image length");
  return {
    version: m[0],
    image_size: imageLength,
    max_image_size: be(m.slice(9, 13)),
    sensor_type: be(m.slice(29, 31)),
    hardware_id: hex(m.slice(31, 34)),
  };
}

// One release per build: <sensor_type>-<hardware_id>-v<version>
const tagFor = (h) => `${h.sensor_type}-${h.hardware_id}-v${h.version}`;
const TAG_RE = /^(\d+)-([0-9a-f]{6})-v(\d+)$/;

module.exports = { parse, tagFor, TAG_RE };
