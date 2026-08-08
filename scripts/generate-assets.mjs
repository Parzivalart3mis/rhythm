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
// Match --background in globals.css for light and .dark respectively, so the
// launch image doesn't flash the wrong ground before first paint.
const BG_LIGHT = "#F8F8FA";
const BG_DARK = "#12131C";

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

function splashSvg(w, h, bg) {
  const s = Math.min(w, h) * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <g transform="translate(${(w - s) / 2}, ${(h - s) / 2})">
    ${iconSvg(s).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}
  </g>
</svg>`;
}

// Flat art with few colours — an indexed palette cuts these from ~80KB to a
// few KB each, which matters when there is one per device size per theme.
const PNG_OPTS = { compressionLevel: 9, palette: true };

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png(PNG_OPTS).toFile(out);
}

async function splash(w, h, bg, out) {
  await sharp(Buffer.from(splashSvg(w, h, bg))).png(PNG_OPTS).toFile(out);
}

await mkdir(iconsDir, { recursive: true });
await mkdir(splashDir, { recursive: true });

await png(iconSvg(192), 192, join(iconsDir, "icon-192.png"));
await png(iconSvg(512), 512, join(iconsDir, "icon-512.png"));
await png(iconSvg(512, { maskable: true }), 512, join(iconsDir, "icon-512-maskable.png"));
await png(iconSvg(180), 180, join(iconsDir, "apple-touch-icon.png"));

// Every iPhone still receiving iOS updates. A device with no matching launch
// image gets a blank white rectangle instead, which is the whole problem the
// splash exists to solve. [cssW, cssH, dpr] drive the media queries in
// src/app/layout.tsx — keep the two lists in step.
export const DEVICES = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 16 Plus, 15 Pro Max, 14 Pro Max
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [428, 926, 3], // 14 Plus, 13 Pro Max, 12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [360, 780, 3], // 13 mini, 12 mini
  [375, 812, 3], // 11 Pro, XS, X
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd/3rd gen), 8
];

for (const [cssW, cssH, dpr] of DEVICES) {
  const w = cssW * dpr;
  const h = cssH * dpr;
  await splash(w, h, BG_LIGHT, join(splashDir, `splash-${w}x${h}.png`));
  await splash(w, h, BG_DARK, join(splashDir, `splash-${w}x${h}-dark.png`));
}

console.log(`Generated icons and ${DEVICES.length * 2} splash screens.`);
