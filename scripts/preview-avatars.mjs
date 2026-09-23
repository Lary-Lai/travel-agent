#!/usr/bin/env node
/**
 * Renders the preset SVGs into a single PNG contact sheet so they can be
 * eyeballed. Diagnostic only — not part of the app.
 *
 * Usage: node scripts/preview-avatars.mjs
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.join("public", "avatars");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".svg"))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const CELL = 96;
const GAP = 12;
const COLS = 6;
const rows = Math.ceil(files.length / COLS);

const canvas = createCanvas(COLS * CELL + (COLS + 1) * GAP, rows * CELL + (rows + 1) * GAP);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);

for (const [index, file] of files.entries()) {
  const image = await loadImage(readFileSync(path.join(dir, file)));
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = GAP + col * (CELL + GAP);
  const y = GAP + row * (CELL + GAP);

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, CELL / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, CELL, CELL);
  ctx.restore();
}

const out = path.join("data", "avatars-preview.png");
writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`wrote ${out} (${files.length} avatars, ${canvas.width}x${canvas.height})`);
