#!/usr/bin/env node
/**
 * Does the configured AI endpoint accept image input?
 *
 * This gates whether scanned (image-only) PDFs can be OCR'd at all: without a
 * vision-capable model the only honest option is a clearer error message.
 *
 * Usage: node scripts/test-vision.mjs
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // env already provided
}

const apiKey = process.env.AI_API_KEY?.trim();
const baseURL = (process.env.AI_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/$/, "");
const model = process.env.AI_MODEL?.trim() || "deepseek-chat";

console.log(`endpoint : ${baseURL}`);
console.log(`model    : ${model}\n`);

const IMAGE_URL =
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=512&q=70&auto=format&fit=crop";

async function probe(label, content) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      max_tokens: 80,
    }),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }

  if (response.status === 200) {
    console.log(`  PASS  ${label}`);
    console.log(`        -> ${JSON.stringify(json.choices?.[0]?.message?.content)?.slice(0, 200)}`);
    return true;
  }

  console.log(`  FAIL  ${label}  (HTTP ${response.status})`);
  console.log(`        -> ${JSON.stringify(json.error ?? json).slice(0, 260)}`);
  return false;
}

console.log("— image input support");

/*
 * A) image by public URL.
 *
 * This is reported as INCONCLUSIVE rather than FAIL when the provider could not
 * fetch the image: with a remote URL, *the provider* downloads it, so a 400 from
 * the image host says the host is unhappy, not that the model cannot see images.
 * The check that matters for this app is B below — the OCR path sends a data URI
 * precisely so it never depends on an external host being reachable.
 */
const remoteOk = await probe("image_url (remote URL)", [
  { type: "text", text: "用一句中文描述这张图片。" },
  { type: "image_url", image_url: { url: IMAGE_URL } },
]);
if (!remoteOk) {
  console.log("        note: a remote URL is fetched by the provider, not by us —");
  console.log("              treat this as inconclusive and read the data-URI result below.");
}

// B) image as a data URI (what an OCR path would actually send)
try {
  const buffer = Buffer.from(await (await fetch(IMAGE_URL)).arrayBuffer());
  const dataUri = `data:image/jpeg;base64,${buffer.toString("base64")}`;
  console.log(`\n  (embedded image: ${Math.round(buffer.length / 1024)} KB)`);
  await probe("image_url (data URI)", [
    { type: "text", text: "用一句中文描述这张图片。" },
    { type: "image_url", image_url: { url: dataUri } },
  ]);
} catch (error) {
  console.log(`  FAIL  could not build data URI: ${error.message}`);
}

console.log("\n— text-only baseline");
await probe("text only", [{ type: "text", text: "只回复两个字：正常" }]);
