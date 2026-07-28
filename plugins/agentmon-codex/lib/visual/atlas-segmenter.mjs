import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require(process.env.AGENTMON_SHARP_MODULE || "sharp");

function copyPixel(source, destination, sourceOffset, destinationOffset, channels) {
  destination[destinationOffset] = source[sourceOffset];
  destination[destinationOffset + 1] = source[sourceOffset + 1];
  destination[destinationOffset + 2] = source[sourceOffset + 2];
  destination[destinationOffset + 3] = channels > 3 ? source[sourceOffset + 3] : 255;
}

export async function segmentAtlasSubjects(source, expectedCount) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  const labels = new Int16Array(info.width * info.height);
  labels.fill(-1);
  const components = [];

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * info.channels + 3] < 24) continue;
    const id = components.length;
    const stack = [start];
    visited[start] = 1;
    const box = { id, count: 0, minX: info.width, minY: info.height, maxX: 0, maxY: 0 };
    while (stack.length) {
      const index = stack.pop();
      labels[index] = id;
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      box.count += 1;
      box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= info.width || nextY >= info.height) continue;
        const next = nextY * info.width + nextX;
        if (!visited[next] && data[next * info.channels + 3] >= 24) { visited[next] = 1; stack.push(next); }
      }
    }
    box.centerX = (box.minX + box.maxX) / 2;
    box.centerY = (box.minY + box.maxY) / 2;
    components.push(box);
  }

  const primaryComponents = components.filter((component) => component.count > 100).sort((left, right) => right.count - left.count).slice(0, expectedCount);
  if (primaryComponents.length !== expectedCount) throw new Error(`${source} contains ${primaryComponents.length} detectable species, expected ${expectedCount}.`);
  const subjects = primaryComponents.map((component) => ({
    ...component,
    componentIds: new Set([component.id]),
    primaryCenterX: component.centerX,
    primaryCenterY: component.centerY,
  }));
  const primaryIds = new Set(primaryComponents.map((component) => component.id));
  for (const component of components) {
    if (primaryIds.has(component.id) || component.count < 6) continue;
    const nearest = subjects.map((subject) => ({ subject, distance: Math.hypot(subject.primaryCenterX - component.centerX, subject.primaryCenterY - component.centerY) })).sort((left, right) => left.distance - right.distance)[0];
    if (!nearest || nearest.distance > Math.max(info.width, info.height) / 8) continue;
    nearest.subject.componentIds.add(component.id);
    nearest.subject.minX = Math.min(nearest.subject.minX, component.minX);
    nearest.subject.minY = Math.min(nearest.subject.minY, component.minY);
    nearest.subject.maxX = Math.max(nearest.subject.maxX, component.maxX);
    nearest.subject.maxY = Math.max(nearest.subject.maxY, component.maxY);
  }
  subjects.sort((left, right) => {
    const leftRow = Math.min(3, Math.floor((left.primaryCenterY * 4) / info.height));
    const rightRow = Math.min(3, Math.floor((right.primaryCenterY * 4) / info.height));
    return leftRow - rightRow || left.primaryCenterX - right.primaryCenterX;
  });

  return {
    width: info.width,
    height: info.height,
    subjects,
    async extract(subject, padding = 8) {
      const left = Math.max(0, subject.minX - padding);
      const top = Math.max(0, subject.minY - padding);
      const right = Math.min(info.width, subject.maxX + padding + 1);
      const bottom = Math.min(info.height, subject.maxY + padding + 1);
      const width = right - left;
      const height = bottom - top;
      const output = Buffer.alloc(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const sourceIndex = (top + y) * info.width + left + x;
          const label = labels[sourceIndex];
          let owned = subject.componentIds.has(label);
          if (!owned && data[sourceIndex * info.channels + 3] > 0) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nearX = left + x + dx;
              const nearY = top + y + dy;
              if (nearX >= 0 && nearY >= 0 && nearX < info.width && nearY < info.height && subject.componentIds.has(labels[nearY * info.width + nearX])) { owned = true; break; }
            }
          }
          if (owned) copyPixel(data, output, sourceIndex * info.channels, (y * width + x) * 4, info.channels);
        }
      }
      return sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
    },
  };
}
