/**
 * Travel-plan text extraction.
 *
 * Handles three kinds of upload:
 *   1. a PDF with a real text layer      -> read it directly (fast, exact)
 *   2. a scanned / photographed PDF      -> rasterise pages, then OCR them
 *   3. a plain image (JPG/PNG/WebP)      -> OCR it directly
 *
 * OCR is done by the configured vision model: we render each page to a PNG and
 * ask the model to transcribe it verbatim. That keeps a single model
 * configuration for the whole app.
 *
 * IMPORTANT: pdf.js *transfers* (detaches) the ArrayBuffer it is handed, so the
 * same bytes cannot be reused for a second call. Every call gets a fresh copy.
 */
import { generateText } from "ai";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

import { createChatModel, getAiConfig } from "../agent/provider";

/** Below this many characters we assume there is no usable text layer. */
const MIN_TEXT_LAYER_CHARS = 40;

/** Cap OCR work: page count, and how wide each page is rendered. */
const MAX_OCR_PAGES = 5;
const OCR_PAGE_WIDTH = 1200;

const OCR_PROMPT = `你是 OCR 文字识别助手。请逐字转录这张图片中的所有文字。

要求：
- 保留原有的换行与条目结构
- 只输出转录出的文字本身，不要添加任何解释、标题、总结或翻译
- 如果图片中确实没有任何可读文字，只输出 NO_TEXT`;

export type ExtractionMethod = "pdf-text" | "ocr";

export type ExtractionResult = {
  text: string;
  method: ExtractionMethod;
  pageCount: number;
  /** Characters the PDF text layer produced (0 for a scan). */
  textLayerChars: number;
};

/** A fresh copy of the bytes — pdf.js detaches whatever buffer it is given. */
const freshCopy = (bytes: Uint8Array) => new Uint8Array(bytes);

function joinExtracted(value: string | string[]): string {
  return (Array.isArray(value) ? value.join("\n") : value).trim();
}

/** Read the PDF text layer. Returns "" for a scanned document. */
async function readTextLayer(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocumentProxy(freshCopy(bytes));
  const result = await extractText(pdf, { mergePages: true });
  return { text: joinExtracted(result.text), pageCount: pdf.numPages };
}

/** Render up to MAX_OCR_PAGES pages to PNG data URIs. */
async function rasterizePages(bytes: Uint8Array, pageCount: number): Promise<string[]> {
  const pages = Math.min(pageCount, MAX_OCR_PAGES);
  const dataUrls: string[] = [];

  for (let page = 1; page <= pages; page++) {
    const dataUrl = await renderPageAsImage(freshCopy(bytes), page, {
      // unpdf calls this thunk itself; passing the module directly fails.
      canvasImport: () => import("@napi-rs/canvas"),
      width: OCR_PAGE_WIDTH,
      toDataURL: true,
    });
    dataUrls.push(dataUrl as unknown as string);
  }

  return dataUrls;
}

/** Transcribe one image with the configured vision model. */
async function transcribe(
  dataUrl: string,
  model: ReturnType<typeof createChatModel>,
): Promise<string> {
  const { text } = await generateText({
    model,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          { type: "image", image: dataUrl },
        ],
      },
    ],
  });

  const trimmed = text.trim();
  return trimmed === "NO_TEXT" || trimmed.length === 0 ? "" : trimmed;
}

/**
 * Extract a travel plan's text from an uploaded document.
 *
 * Throws an Error with a user-facing Chinese message when nothing usable can be
 * recovered, so the Route Handler can surface it directly.
 */
export async function extractPlanText({
  bytes,
  mimeType,
  fileName,
}: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<ExtractionResult> {
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = mimeType.startsWith("image/");

  if (!isPdf && !isImage) {
    throw new Error("仅支持 PDF 或图片（JPG / PNG / WebP）格式的旅行计划");
  }

  const config = getAiConfig();

  // ---------------------------------------------------------------- PDF path
  if (isPdf) {
    const { text: layerText, pageCount } = await readTextLayer(bytes);

    if (layerText.length >= MIN_TEXT_LAYER_CHARS) {
      return {
        text: layerText,
        method: "pdf-text",
        pageCount,
        textLayerChars: layerText.length,
      };
    }

    // No usable text layer -> a scan or photo. Needs a vision model.
    if (!config.configured) {
      throw new Error(
        "这份 PDF 没有文字层（扫描件或拍照件），需要配置支持图片的模型才能识别。请设置 AI_API_KEY 后重试。",
      );
    }

    const dataUrls = await rasterizePages(bytes, pageCount);
    const model = createChatModel();
    const parts: string[] = [];

    for (const [index, dataUrl] of dataUrls.entries()) {
      const pageText = await transcribe(dataUrl, model);
      if (pageText) parts.push(pageCount > 1 ? `【第 ${index + 1} 页】\n${pageText}` : pageText);
    }

    const ocrText = parts.join("\n\n").trim();
    if (ocrText.length < MIN_TEXT_LAYER_CHARS) {
      throw new Error(
        "已按扫描件识别，但仍未读出有效文字。请确认 PDF 内容清晰、方向正确，或直接上传行程截图。",
      );
    }

    return {
      text: ocrText,
      method: "ocr",
      pageCount,
      textLayerChars: layerText.length,
    };
  }

  // -------------------------------------------------------------- image path
  if (!config.configured) {
    throw new Error("图片识别需要配置支持图片的模型，请设置 AI_API_KEY 后重试。");
  }

  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
  const ocrText = await transcribe(dataUrl, createChatModel());

  if (ocrText.length < MIN_TEXT_LAYER_CHARS) {
    throw new Error("未能从这张图片中读出有效文字，请确认图片清晰、方向正确。");
  }

  return { text: ocrText, method: "ocr", pageCount: 1, textLayerChars: 0 };
}
