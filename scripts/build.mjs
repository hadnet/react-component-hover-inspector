import { build, context } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

const entries = {
  background: join(root, "src/background.ts"),
  content: join(root, "src/content.ts"),
  "page-inspector": join(root, "src/page-inspector.ts"),
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createIcon(size) {
  const rowLength = size * 4 + 1;
  const pixels = Buffer.alloc(rowLength * size);
  const scale = size / 128;

  for (let y = 0; y < size; y += 1) {
    const row = y * rowLength;
    pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const edge = Math.min(x, y, size - x - 1, size - y - 1);
      const inBracket =
        ((x >= 28 * scale && x <= 38 * scale) ||
          (x >= 90 * scale && x <= 100 * scale)) &&
        y >= 33 * scale &&
        y <= 95 * scale;
      const inHorizontal =
        ((x >= 28 * scale && x <= 53 * scale) ||
          (x >= 75 * scale && x <= 100 * scale)) &&
        ((y >= 33 * scale && y <= 43 * scale) ||
          (y >= 85 * scale && y <= 95 * scale));

      pixels[offset] = inBracket || inHorizontal ? 196 : 25 + edge;
      pixels[offset + 1] = inBracket || inHorizontal ? 181 : 24 + edge;
      pixels[offset + 2] = inBracket || inHorizontal ? 253 : 34 + edge;
      pixels[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function copyStaticFiles() {
  await mkdir(join(dist, "icons"), { recursive: true });
  await Promise.all([
    readFile(join(root, "public/manifest.json")).then((contents) =>
      writeFile(join(dist, "manifest.json"), contents),
    ),
    readFile(join(root, "public/inspector.css")).then((contents) =>
      writeFile(join(dist, "inspector.css"), contents),
    ),
    ...[16, 32, 48, 128].map((size) =>
      writeFile(join(dist, `icons/icon-${size}.png`), createIcon(size)),
    ),
  ]);
}

const buildOptions = {
  entryPoints: entries,
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: dist,
  sourcemap: true,
  logLevel: "info",
};

await rm(dist, { recursive: true, force: true });
await mkdir(dirname(join(dist, "placeholder")), { recursive: true });
await copyStaticFiles();

if (watch) {
  const buildContext = await context(buildOptions);
  await buildContext.watch();
  console.log("Watching extension sources...");
} else {
  await build(buildOptions);
  console.log("Built React Component Hover Inspector in dist/");
}
