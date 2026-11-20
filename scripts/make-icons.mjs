// Regenerate app icons: node scripts/make-icons.mjs
import sharp from "sharp";
// Logo: an open book with a spark, on the brand colour. Pure shapes – no font dependency.
const book = (s) => `
  <g transform="translate(${s.x} ${s.y}) scale(${s.k})">
    <path d="M8 22c10-5 22-5 32 1v42c-10-6-22-6-32-1z" fill="#fff"/>
    <path d="M72 22c-10-5-22-5-32 1v42c10-6 22-6 32-1z" fill="#dbe8f5"/>
    <path d="M40 23v42" stroke="#1f4e79" stroke-width="2.5"/>
    <path d="M16 33h16M16 41h16M16 49h12M48 33h16M48 41h16M48 49h12" stroke="#9fb7cf" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="62" cy="12" r="7" fill="#f59e5b"/>
  </g>`;
const svg = (size, pad, rounded) => {
  const k = (size * (1 - pad * 2)) / 80;
  const off = size * pad;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="#1f4e79"/>
    ${book({ x: off, y: off + size * 0.02, k })}
  </svg>`);
};
const out = [
  ["public/icons/icon-192.png", 192, 0.14, true],
  ["public/icons/icon-512.png", 512, 0.14, true],
  ["public/icons/maskable-512.png", 512, 0.24, false], // safe zone for Android masks
  ["src/app/apple-icon.png", 180, 0.16, false], // iOS adds its own rounded corners
  ["src/app/icon.png", 64, 0.1, true],
];
for (const [file, size, pad, rounded] of out) await sharp(svg(size, pad, rounded)).png().toFile(file);
console.log("icons done");
