import { strict as assert } from "node:assert";

import sharp from "sharp";

import { imageMetrics, daylightFinding } from "../server/pmr/image";
const bytes = await sharp({
  create: {
    width: 1000,
    height: 800,
    channels: 3,
    background: { r: 40, g: 100, b: 160 },
  },
})
  .png()
  .toBuffer();
const first = await imageMetrics(bytes),
  second = await imageMetrics(bytes);
assert.equal(first.sha, second.sha);
assert.equal(first.width, 1000);
assert.equal(first.height, 800);
assert.equal(first.perceptualHash.length, 16);
await assert.rejects(() => imageMetrics(Buffer.from("not an image")));
assert.equal(
  daylightFinding("indoor", 1, 24.7, 46.7, "2026-10-26T21:00:00Z"),
  null,
);
assert.equal(
  daylightFinding("day", 1, 24.7, 46.7, "2026-10-26T21:00:00Z")?.severity,
  "block",
);
console.log(
  "PASS: actual PNG decoding/dimensions, deterministic server hash, perceptual hash, invalid-image rejection, outdoor daylight conflict and indoor exclusion.",
);
