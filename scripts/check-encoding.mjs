/**
 * Guard against the two ways a source file gets silently corrupted.
 *
 *     node scripts/check-encoding.mjs [--fix]
 *
 * Both failures have happened in this repository, more than once, and both are
 * invisible in the editor:
 *
 *  1. **A UTF-8 BOM.** PowerShell 5.1's `Set-Content -Encoding UTF8` writes one.
 *     It breaks nothing at compile time, which is exactly the problem — it shows
 *     up as an unexplained character in every diff and spreads by copy-paste.
 *  2. **Mojibake.** Reading a UTF-8 file through a legacy codepage and writing it
 *     back turns `—` into `鈥?` and `东京` into `涓滀含`. That is not cosmetic when
 *     it lands in a template string: a corrupted date-range separator ships to
 *     users.
 *
 * The rule that prevents both is "edit source with the edit/write tools, never
 * with shell cmdlets". This script is the net for when that rule is broken anyway
 * — which it has been, twice, by the same person who wrote the rule.
 *
 * `--fix` strips BOMs and reports; it never guesses at mojibake, because the
 * correct restoration is unknowable from the damaged bytes (the right fix is
 * `git checkout` and redo the edit).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const FIX = process.argv.includes("--fix");

/** Directories and files to scan, relative to the repo root. */
const TARGETS = ["app", "components", "lib", "server", "agent", "prisma", "scripts", "types"];
const ROOT_FILES = ["README.md", "package.json", "tsconfig.json", "next.config.ts", "prisma.config.ts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".json", ".md", ".sql", ".prisma"]);

/**
 * Characters that only appear when UTF-8 was decoded as a legacy codepage.
 *
 * Kept to sequences that are not plausible in this project's real content
 * (Chinese, Japanese, Korean, Spanish and English are all expected): a broad CJK
 * range would flag legitimate text.
 */
const MOJIBAKE = /[鈥锛銆鐨鍜鏂鏃閿馃锟銆併儸鎴]/;

/**
 * Mojibake is only checked in **code**, and never in this file.
 *
 * Code because that is where the damage can reach a user: a corrupted `–` inside
 * a template string ships, while a corrupted em dash in a README paragraph is
 * merely ugly and a reviewer will see it. Documentation that *describes* the
 * problem — this file's own comments, and the README section about the incident —
 * necessarily contains the damaged characters verbatim, and a detector that
 * fires on its own warnings is a detector nobody keeps.
 */
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".sql", ".prisma"]);
const MOJIBAKE_SELF = path.join("scripts", "check-encoding.mjs");

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const files = [];
for (const target of [...TARGETS, ...ROOT_FILES]) {
  const stats = await import("node:fs/promises").then((fs) => fs.stat(target).catch(() => null));
  if (!stats) continue;
  if (stats.isDirectory()) {
    for await (const file of walk(target)) files.push(file);
  } else {
    files.push(target);
  }
}

const bomFiles = [];
const mojibakeFiles = [];

for (const file of files) {
  let bytes = readFileSync(file);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bomFiles.push(file);
    if (FIX) {
      bytes = bytes.subarray(3);
      writeFileSync(file, bytes.toString("utf8"), "utf8");
    }
  }

  const text = bytes.toString("utf8");
  if (!CODE_EXTENSIONS.has(path.extname(file)) || file.endsWith(MOJIBAKE_SELF)) continue;

  const bad = text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => MOJIBAKE.test(entry.line));
  if (bad.length > 0) mojibakeFiles.push({ file, lines: bad });
}

console.log(`scanned ${files.length} file(s)`);

let failed = 0;

if (bomFiles.length === 0) {
  console.log("  PASS  no UTF-8 BOM in any source file");
} else if (FIX) {
  console.log(`  FIXED ${bomFiles.length} file(s) with a BOM: ${bomFiles.join(", ")}`);
} else {
  failed++;
  console.log(`  FAIL  ${bomFiles.length} file(s) start with a UTF-8 BOM: ${bomFiles.join(", ")}`);
  console.log("        (re-run with --fix to strip it)");
}

if (mojibakeFiles.length === 0) {
  console.log("  PASS  no mojibake in any source file");
} else {
  failed++;
  console.log(`  FAIL  mojibake in ${mojibakeFiles.length} file(s)`);
  for (const { file, lines } of mojibakeFiles) {
    for (const line of lines.slice(0, 3)) {
      console.log(`        ${file}:${line.number}  ${line.line.trim().slice(0, 90)}`);
    }
  }
  console.log("        (restore with `git checkout <file>` and redo the edit — do not guess)");
}

console.log(failed === 0 ? "\nENCODING: OK" : "\nENCODING: PROBLEMS FOUND");
process.exit(failed === 0 ? 0 : 1);
