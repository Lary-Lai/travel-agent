#!/usr/bin/env node
/**
 * Builds a "scanned" PDF test fixture: a page whose entire content is a JPEG
 * image, with no text layer at all. This is what a phone-scanned or
 * photographed travel plan looks like to a PDF text extractor.
 *
 * Usage: node scripts/make-scanned-pdf.mjs [outputPath]
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

const outputPath = process.argv[2] ?? "scripts/sample-scanned-plan.pdf";

// ---------------------------------------------------------------- draw a page
const WIDTH = 1000;
const HEIGHT = 1300;
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Paper-ish background with a slight scanner tint.
ctx.fillStyle = "#f7f5f1";
ctx.fillRect(0, 0, WIDTH, HEIGHT);

ctx.fillStyle = "#1f2937";
ctx.font = "bold 40px sans-serif";
ctx.fillText("Tokyo Travel Plan", 70, 110);

ctx.font = "26px sans-serif";
const lines = [
  "Day 1: Arrive in Tokyo, check in at hotel in Shibuya",
  "Day 2: Sensoji Temple, then Tokyo Skytree",
  "Day 3: Shibuya crossing and Shinjuku",
  "Day 4: Tokyo Disneyland",
  "Day 5: Return home",
  "",
  "Guests: 4 people",
  "Budget: 800 CNY per night",
  "Hotel area: Shibuya, near the subway",
];
lines.forEach((line, index) => {
  ctx.fillText(line, 70, 190 + index * 52);
});

// A little noise so it looks like a scan rather than a clean render.
for (let i = 0; i < 4000; i++) {
  ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
  ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 2, 2);
}

const jpeg = canvas.toBuffer("image/jpeg", 82);
console.log(`rendered page image: ${WIDTH}x${HEIGHT}, ${Math.round(jpeg.length / 1024)} KB`);

// ------------------------------------------------- embed it as a PDF XObject
// A minimal PDF: one page whose content stream just paints the JPEG. There is
// deliberately NO text object, so text extraction returns nothing.
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  null, // image XObject, written separately (binary)
  null, // content stream
];

const content = `q ${WIDTH} 0 0 ${HEIGHT} 0 0 cm /Im0 Do Q`;

let pdf = Buffer.from("%PDF-1.4\n", "latin1");
const offsets = [];

const writeObject = (index, body) => {
  offsets.push(pdf.length);
  pdf = Buffer.concat([
    pdf,
    Buffer.from(`${index + 1} 0 obj\n`, "latin1"),
    Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"),
    Buffer.from("\nendobj\n", "latin1"),
  ]);
};

// 1..3 textual
for (let i = 0; i < 3; i++) writeObject(i, objects[i]);

// 4: image XObject
const imageDict =
  `<< /Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT} ` +
  `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
writeObject(3, Buffer.concat([Buffer.from(imageDict, "latin1"), jpeg, Buffer.from("\nendstream", "latin1")]));

// 5: content stream
const contentBody = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
writeObject(4, contentBody);

const xref = pdf.length;
pdf = Buffer.concat([
  pdf,
  Buffer.from(
    `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    "latin1",
  ),
]);

writeFileSync(outputPath, pdf);
console.log(`wrote ${outputPath} (${Math.round(pdf.length / 1024)} KB, image-only, no text layer)`);

// Also emit the raw page image, so the plain-image OCR path can be tested too.
const imagePath = outputPath.replace(/\.pdf$/i, ".jpg");
writeFileSync(imagePath, jpeg);
console.log(`wrote ${imagePath} (${Math.round(jpeg.length / 1024)} KB, same page as a photo)`);
