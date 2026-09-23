import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Model configuration.
 *
 * Any OpenAI-compatible endpoint works: point AI_BASE_URL at the gateway and
 * set AI_MODEL. Defaults target the Agnes gateway with agnes-2.5-flash.
 */
export type AiConfig = {
  baseURL: string;
  model: string;
  configured: boolean;
  /** Human-readable reason the model cannot be used, when applicable. */
  problem: string | null;
};

const DEFAULT_BASE_URL = "https://apihub.agnes-ai.com/v1";
const DEFAULT_MODEL = "agnes-2.5-flash";

export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const baseURL = process.env.AI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;

  if (!apiKey || apiKey === "your-api-key-here") {
    return {
      baseURL,
      model,
      configured: false,
      problem: "未配置 AI_API_KEY，请在 .env 中填入有效的 API Key 后重启服务。",
    };
  }

  return { baseURL, model, configured: true, problem: null };
}

/** Build the chat model. Throws a clear error when the key is missing. */
export function createChatModel(): LanguageModel {
  const config = getAiConfig();
  if (!config.configured) {
    throw new Error(config.problem ?? "AI 模型未配置");
  }

  const provider = createOpenAICompatible({
    name: "travel-agent",
    baseURL: config.baseURL,
    apiKey: process.env.AI_API_KEY?.trim(),
  });

  return provider.chatModel(config.model);
}
