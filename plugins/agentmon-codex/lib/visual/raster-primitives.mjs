import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function createSurface(width, height) {
  return { width, height, pixels: new Uint8Array(width * height * 4) };
}

export function setPixel(surface, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) return;
  surface.pixels.set(color, (py * surface.width + px) * 4);
}

export function rect(surface, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) setPixel(surface, px, py, color);
  }
}

export function ellipse(surface, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1) setPixel(surface, x, y, color);
    }
  }
}

export function polygon(surface, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) intersections.push(Math.round(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)));
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) rect(surface, intersections[index], y, intersections[index + 1] - intersections[index] + 1, 1, color);
  }
}

export function line(surface, x0, y0, x1, y1, color, thickness = 1) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - x);
  const sx = x < targetX ? 1 : -1;
  const dy = -Math.abs(targetY - y);
  const sy = y < targetY ? 1 : -1;
  let error = dx + dy;
  while (true) {
    rect(surface, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
    if (x === targetX && y === targetY) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

export function fill(surface, color) {
  rect(surface, 0, 0, surface.width, surface.height, color);
}

export function blit(target, source, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      const color = source.pixels.subarray(offset, offset + 4);
      if (color[3]) setPixel(target, offsetX + x, offsetY + y, color);
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const body = Buffer.concat([typeBuffer, data]);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  body.copy(output, 4);
  output.writeUInt32BE(crc32(body), data.length + 8);
  return output;
}

export function encodePng(surface, scale = 1) {
  const pixelScale = Math.max(1, Math.round(scale));
  const width = surface.width * pixelScale;
  const height = surface.height * pixelScale;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const source = (Math.floor(y / pixelScale) * surface.width + Math.floor(x / pixelScale)) * 4;
      row.set(surface.pixels.subarray(source, source + 4), 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
