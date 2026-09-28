/**
 * Report every source file that still contains visible (non-comment) Chinese,
 * so the remaining i18n work is enumerated rather than guessed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CJK = /[\u4e00-\u9fff]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/node_modules|generated|\.next|components[\\/]ui/.test(full)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [...walk("components"), ...walk("app")];
const rows = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  const hits = lines
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => CJK.test(line))
    // Skip comment lines and the dictionaries themselves.
    .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(([, line]) => !/^\s*import\s/.test(line));

  if (hits.length > 0) rows.push({ file, hits });
}

rows.sort((a, b) => b.hits.length - a.hits.length);

console.log(`\n  Files with visible Chinese: ${rows.length}\n`);
for (const { file, hits } of rows) {
  console.log(`  ${String(hits.length).padStart(3)}  ${file.replace(/\\/g, "/")}`);
}
console.log("");

if (process.argv.includes("--detail")) {
  for (const { file, hits } of rows) {
    console.log(`\n  === ${file} ===`);
    for (const [line, text] of hits) console.log(`    L${line}: ${text.trim().slice(0, 100)}`);
  }
}
