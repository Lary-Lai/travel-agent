import { generateObject } from "ai";
import type { NextRequest } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";

import { getAiConfig, createChatModel } from "@/agent/provider";
import { CITIES, findCity } from "@/lib/cities";
import { badRequest, errorResponse, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Keep prompts bounded even for a very long document. */
const MAX_TEXT_CHARS = 12_000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const planSchema = z.object({
  destination: z.string().nullable().describe("旅行目的地城市，例如 东京；无法确定则为 null"),
  days: z.number().int().nullable().describe("行程天数；无法确定则为 null"),
  guests: z.number().int().nullable().describe("出行人数；无法确定则为 null"),
  budgetPerNight: z
    .number()
    .nullable()
    .describe("每晚住宿预算（人民币）；无法确定则为 null"),
  places: z.array(z.string()).describe("计划中提到的景点或地区名称"),
  summary: z.string().describe("用一句中文概括这个行程"),
});

type TravelPlan = z.infer<typeof planSchema>;

/**
 * Heuristic extraction used when no model is configured or the model call
 * fails. Keeps the PDF feature useful instead of returning nothing.
 * Handles Chinese and English itineraries.
 */
function extractWithHeuristics(text: string): TravelPlan {
  const city = findCity(text);

  const dayMatches = [...text.matchAll(/(?:day|第)\s*(\d{1,2})\s*(?:天)?/gi)].map((match) =>
    Number(match[1]),
  );
  const daysFromLabel = dayMatches.length > 0 ? Math.max(...dayMatches) : null;
  const daysFromCn = text.match(/(\d{1,2})\s*(?:天|days?)/i);
  const days = daysFromLabel ?? (daysFromCn ? Number(daysFromCn[1]) : null);

  // "4 人" / "4 people" / "guests: 4"
  const guestsMatch =
    text.match(/(\d{1,2})\s*(?:人|位|people|persons?|guests?|adults?)/i) ??
    text.match(/(?:guests?|people|persons?|人数|人数)\D{0,8}(\d{1,2})/i);
  const guests = guestsMatch ? Number(guestsMatch[1]) : null;

  // "每晚 800 元" / "budget 800 CNY" / "800/night"
  const budgetMatch =
    text.match(/(?:预算|每晚|住宿|budget|per night|nightly)\D{0,12}(\d{2,5})/i) ??
    text.match(/(\d{2,5})\s*(?:元|块|cny|rmb)\b/i) ??
    text.match(/(\d{2,5})\s*\/\s*(?:晚|night)/i);
  const budgetPerNight = budgetMatch ? Number(budgetMatch[1]) : null;

  // Lines that look like itinerary entries.
  const places = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /(?:day|第)\s*\d|→|->/.test(line))
        .flatMap((line) =>
          line
            .replace(/^(?:day|第)\s*\d{1,2}\s*(?:天)?[:：]?/i, "")
            .split(/→|->|,|，|、/)
            .map((part) => part.trim())
            .filter((part) => part.length > 1 && part.length <= 24),
        ),
    ),
  ].slice(0, 12);

  return {
    destination: city?.nameZh ?? null,
    days,
    guests,
    budgetPerNight,
    places,
    summary: `从上传的旅行计划中识别到 ${days ?? "若干"} 天行程${
      city ? `，目的地为${city.nameZh}` : ""
    }。`,
  };
}

/**
 * POST /api/agent/upload
 * PDF -> text -> structured plan -> handed back to the Agent.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) throw badRequest("请求格式不正确，应为 multipart/form-data");

    const file = formData.get("file");
    if (!(file instanceof File)) throw badRequest("请上传 PDF 文件");
    if (file.size === 0) throw badRequest("上传的文件为空");
    if (file.size > MAX_UPLOAD_BYTES) throw badRequest("文件过大，请上传 8MB 以内的 PDF");
    if (file.type && file.type !== "application/pdf") {
      throw badRequest("仅支持 PDF 格式的旅行计划");
    }

    // ------------------------------------------------------------ extract text
    let text: string;
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buffer);
      const extracted = await extractText(pdf, { mergePages: true });
      text = (Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text).trim();
    } catch (error) {
      console.error("[upload] pdf parse failed:", error);
      throw badRequest("PDF 解析失败，请确认文件未加密且包含可提取的文字");
    }

    if (text.length < 10) {
      throw badRequest("未能从 PDF 中提取到有效文字，可能是扫描件（图片型 PDF）");
    }

    const clipped = text.slice(0, MAX_TEXT_CHARS);

    // ---------------------------------------------------- structure with LLM
    const config = getAiConfig();
    let plan: TravelPlan;
    let source: "llm" | "heuristic" = "llm";

    if (!config.configured) {
      plan = extractWithHeuristics(clipped);
      source = "heuristic";
    } else {
      try {
        const result = await generateObject({
          model: createChatModel(),
          schema: planSchema,
          temperature: 0.1,
          prompt: `下面是一份旅行计划文本。请提取结构化的住宿需求信息，并以 JSON 格式返回（只输出 JSON，不要输出任何额外说明文字）。

规则：
- destination 请使用中文城市名（例如「东京」）。平台覆盖的城市有：${CITIES.map((c) => c.nameZh).join("、")}。
- days 是行程总天数；guests 是出行人数。
- budgetPerNight 只在文本明确提到住宿预算时为数字，否则为 null。不要把机票、餐饮或总预算当作每晚预算。
- places 列出计划中提到的景点、地区或地标名称，最多 12 个。
- summary 用一句简洁的中文概括行程。

旅行计划文本：
"""
${clipped}
"""`,
        });
        plan = result.object;
      } catch (error) {
        // Model unavailable or returned unusable output — still return a result.
        console.error("[upload] LLM structuring failed, falling back:", error);
        plan = extractWithHeuristics(clipped);
        source = "heuristic";
      }
    }

    // Normalise the city the model returned into a canonical name.
    if (plan.destination) {
      const city = findCity(plan.destination);
      if (city) plan.destination = city.name;
    }

    return ok({
      plan,
      source,
      textLength: text.length,
      preview: clipped.slice(0, 400),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
