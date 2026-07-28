import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { segmentAtlasSubjects } from "../lib/visual/atlas-segmenter.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

test("extracts a complete subject that crosses a nominal atlas cell boundary", async () => {
  const width = 400;
  const height = 400;
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const subjectIndex = row * 4 + column;
      const left = column * 100 + 25;
      const top = subjectIndex === 4 ? 88 : row * 100 + 25;
      const subjectHeight = subjectIndex === 4 ? 54 : 50;
      for (let y = top; y < top + subjectHeight; y += 1) {
        for (let x = left; x < left + 50; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 20 + subjectIndex * 10;
          pixels[offset + 1] = 180;
          pixels[offset + 2] = 90;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  const atlasPng = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const atlas = await segmentAtlasSubjects(atlasPng, 16);
  const crossing = await atlas.extract(atlas.subjects[4], 8);
  const { data, info } = await sharp(crossing).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaqueHeight = 0;
  const occupiedRows = new Set();
  const colors = new Set();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (!data[offset + 3]) continue;
      occupiedRows.add(y);
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
    }
  }
  opaqueHeight = occupiedRows.size;
  assert.equal(opaqueHeight, 54, "the pixels above the old grid boundary must be retained");
  assert.deepEqual([...colors], ["60,180,90"], "neighboring subjects must be masked out");
});
