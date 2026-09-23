#!/usr/bin/env node
/**
 * Generates a small, valid PDF travel plan used to test the PDF upload flow.
 *
 * Usage: node scripts/make-test-pdf.mjs [outputPath]
 */
import { writeFileSync } from "node:fs";

const outputPath = process.argv[2] ?? "scripts/sample-travel-plan.pdf";

const LINES = [
  "Tokyo Travel Plan",
  "",
  "Day 1: Arrive in Tokyo, check in at hotel in Shibuya",
  "Day 2: Sensoji Temple -> Tokyo Skytree",
  "Day 3: Shibuya -> Shinjuku",
  "Day 4: Tokyo Disneyland",
  "Day 5: Return home",
  "",
  "Guests: 4 people",
  "Budget: 800 CNY per night",
];

/** Build a PDF content stream that prints the itinerary. */
function buildContent() {
  const escaped = LINES.map((line) => line.replace(/\\/g, "").replace(/[()]/g, ""));
  return [
    "BT",
    "/F1 13 Tf",
    "16 TL",
    "72 720 Td",
    ...escaped.map((line) => `(${line}) Tj T*`),
    "ET",
  ].join("\n");
}

const content = buildContent();

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets = [];

objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

writeFileSync(outputPath, Buffer.from(pdf, "latin1"));
console.log(`wrote ${outputPath} (${Buffer.byteLength(pdf, "latin1")} bytes)`);
