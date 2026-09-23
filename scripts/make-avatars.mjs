#!/usr/bin/env node
/**
 * Generates the built-in preset avatars as local SVG files.
 *
 * These used to come from i.pravatar.cc, which now answers **403 to every
 * request** — 22 of the 24 presets rendered as broken images. Bundling them
 * removes the external dependency entirely: they always load, offline included,
 * and cost a few hundred bytes each.
 *
 * Usage: node scripts/make-avatars.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join("public", "avatars");

/** Background gradients, chosen to sit alongside the coral brand colour. */
const PALETTES = [
  ["#FF9A8B", "#FF6A88"],
  ["#7BC6FF", "#3B82F6"],
  ["#86EFAC", "#22C55E"],
  ["#FDE68A", "#F59E0B"],
  ["#C4B5FD", "#8B5CF6"],
  ["#FDBA74", "#F97316"],
];

const SILHOUETTES = ["plain", "long-hair", "bun"];

const SOLID = "rgba(255,255,255,0.94)";
/** Softer fill for the hair, so it reads as a separate layer behind the head. */
const SOFT = "rgba(255,255,255,0.55)";

/**
 * Head + shoulders, with a hair variant for variety.
 *
 * Draw order matters: shoulders, then hair, then the head — so the hair falls
 * over the shoulders and the head sits cleanly on top. An earlier version drew
 * the hair as one closed path with an inner cut-out, which rendered as a
 * keyhole with a tiny off-centre head.
 */
function figure(silhouette) {
  const shoulders = `<path d="M16 128c0-26 21.5-44 48-44s48 18 48 44z" fill="${SOLID}"/>`;
  const head = `<circle cx="64" cy="52" r="23" fill="${SOLID}"/>`;

  if (silhouette === "long-hair") {
    const hair = `<rect x="36" y="26" width="56" height="74" rx="28" fill="${SOFT}"/>`;
    return `${shoulders}${hair}${head}`;
  }

  if (silhouette === "bun") {
    const bun = `<circle cx="64" cy="24" r="11" fill="${SOFT}"/>`;
    return `${shoulders}${bun}${head}`;
  }

  return `${shoulders}${head}`;
}

function avatarSvg(palette, silhouette, index) {
  const [from, to] = palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="预设头像 ${index + 1}">
  <defs>
    <linearGradient id="bg${index}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" fill="url(#bg${index})"/>
  <g transform="translate(0, 8)">${figure(silhouette)}
  </g>
</svg>
`;
}

/**
 * The 12 built-in presets, as [paletteIndex, silhouetteIndex] pairs.
 *
 * Listed explicitly rather than computed from modulo arithmetic, which produced
 * duplicate combinations (the same palette *and* shape appearing twice).
 */
const COMBOS = [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 0],
  [4, 1],
  [5, 2],
  [1, 0],
  [2, 1],
  [3, 2],
  [4, 0],
  [5, 1],
  [0, 2],
];

mkdirSync(OUT_DIR, { recursive: true });

const written = [];

for (const [index, [paletteIndex, silhouetteIndex]] of COMBOS.entries()) {
  const palette = PALETTES[paletteIndex];
  const silhouette = SILHOUETTES[silhouetteIndex];
  const file = path.join(OUT_DIR, `avatar-${index + 1}.svg`);

  writeFileSync(file, avatarSvg(palette, silhouette, index), "utf8");
  written.push(`avatar-${index + 1}.svg`);
}

// Remove anything left over from a previous run with a different count.
const { readdirSync, rmSync } = await import("node:fs");
for (const existing of readdirSync(OUT_DIR)) {
  const number = Number(existing.match(/^avatar-(\d+)\.svg$/)?.[1]);
  if (existing.endsWith(".svg") && number > written.length) {
    rmSync(path.join(OUT_DIR, existing));
    console.log(`removed stale ${existing}`);
  }
}

console.log(`wrote ${written.length} avatars to ${OUT_DIR}/`);
console.log(`  ${written.join(", ")}`);
