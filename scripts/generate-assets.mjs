// Generates PWA icons + iOS splash screens from an inline SVG mark.
// Run with: node scripts/generate-assets.mjs  (sharp is a dependency)
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
const splashDir = join(root, "public", "splash");

const PRIMARY = "#4C5FD5";
const BG = "#F8F8FA";

// Abstract weekly-grid / rhythm wave mark.
function iconSvg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.14 : size * 0.08;
  const inner = size - pad * 2;
  const barW = inner / 7;
  const heights = [0.45, 0.72, 0.34, 0.9, 0.55, 0.78, 0.4];
  const bars = heights
    .map((h, i) => {
      const bh = inner * h;
      const x = pad + i * barW + barW * 0.18;
      const y = pad + (inner - bh);
      const w = barW * 0.64;
      const r = w * 0.4;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(
        1
      )}" height="${bh.toFixed(1)}" rx="${r.toFixed(1)}" fill="white" opacity="${(
        0.55 +
        h * 0.45
      ).toFixed(2)}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="${PRIMARY}"/>
  ${bars}
</svg>`;
}

function splashSvg(w, h) {
  const s = Math.min(w, h) * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <g transform="translate(${(w - s) / 2}, ${(h - s) / 2})">
    ${iconSvg(s).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}
  </g>
</svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
}

async function splash(w, h, out) {
  await sharp(Buffer.from(splashSvg(w, h))).png().toFile(out);
}

await mkdir(iconsDir, { recursive: true });
await mkdir(splashDir, { recursive: true });

await png(iconSvg(192), 192, join(iconsDir, "icon-192.png"));
await png(iconSvg(512), 512, join(iconsDir, "icon-512.png"));
await png(iconSvg(512, { maskable: true }), 512, join(iconsDir, "icon-512-maskable.png"));
await png(iconSvg(180), 180, join(iconsDir, "apple-touch-icon.png"));

const splashes = [
  [1290, 2796],
  [1179, 2556],
  [1284, 2778],
  [750, 1334],
];
for (const [w, h] of splashes) {
  await splash(w, h, join(splashDir, `splash-${w}x${h}.png`));
}

console.log("Generated icons and splash screens.");
