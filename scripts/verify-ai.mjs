#!/usr/bin/env node
/**
 * AI provider connectivity + capability check.
 *
 * Verifies, in order:
 *   1. the endpoint answers at all (auth + reachability)
 *   2. plain chat completion works
 *   3. TOOL CALLING works — the capability the whole Agent depends on
 *
 * Usage: node scripts/verify-ai.mjs
 * Reads AI_API_KEY / AI_BASE_URL / AI_MODEL from .env.
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

const apiKey = process.env.AI_API_KEY?.trim();
const baseURL = (process.env.AI_BASE_URL?.trim() || "https://api.deepseek.com/v1").replace(/\/$/, "");
const model = process.env.AI_MODEL?.trim() || "deepseek-chat";

if (!apiKey || apiKey === "your-api-key-here") {
  console.error("AI_API_KEY is not set in .env");
  process.exit(1);
}

console.log(`endpoint : ${baseURL}`);
console.log(`model    : ${model}`);
console.log(`key      : ${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (${apiKey.length} chars)\n`);

async function call(body) {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

let failed = false;

// ---------------------------------------------------------------- 1. basic
console.log("— 1. basic chat completion");
try {
  const { status, json } = await call({
    model,
    messages: [{ role: "user", content: "只回复两个字：可用" }],
    max_tokens: 20,
  });

  if (status !== 200) {
    failed = true;
    console.error(`  FAIL  HTTP ${status}: ${JSON.stringify(json).slice(0, 300)}`);
  } else {
    console.log(`  PASS  回复: ${JSON.stringify(json.choices?.[0]?.message?.content)}`);
    console.log(`  PASS  model echoed: ${json.model}`);
  }
} catch (error) {
  failed = true;
  console.error(`  FAIL  请求异常: ${error.message}`);
}

// ---------------------------------------------------------- 2. tool calling
console.log("\n— 2. tool calling (required by the Agent)");
try {
  const { status, json } = await call({
    model,
    messages: [
      {
        role: "user",
        content: "帮我搜索东京可供 4 人入住的房源，每晚预算 800 元左右。请调用工具。",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "searchListings",
          description: "根据目的地、人数和预算搜索真实房源",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "目的地城市" },
              guests: { type: "integer", description: "入住人数" },
              budgetPerNight: { type: "number", description: "每晚预算（人民币）" },
            },
            required: ["location"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 200,
  });

  if (status !== 200) {
    failed = true;
    console.error(`  FAIL  HTTP ${status}: ${JSON.stringify(json).slice(0, 300)}`);
  } else {
    const message = json.choices?.[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    if (toolCalls.length === 0) {
      failed = true;
      console.error("  FAIL  模型没有发起工具调用（该模型可能不支持 function calling）");
      console.error(`        content: ${JSON.stringify(message?.content)?.slice(0, 200)}`);
    } else {
      const call0 = toolCalls[0];
      console.log(`  PASS  调用工具: ${call0.function?.name}`);
      console.log(`  PASS  参数: ${call0.function?.arguments}`);
      // Confirm the arguments are parseable — the SDK depends on valid JSON.
      try {
        const args = JSON.parse(call0.function.arguments);
        console.log(`  PASS  参数可解析: ${JSON.stringify(args)}`);
      } catch {
        failed = true;
        console.error("  FAIL  工具参数不是合法 JSON");
      }
    }
  }
} catch (error) {
  failed = true;
  console.error(`  FAIL  请求异常: ${error.message}`);
}

// ------------------------------------------------------- 3. multi-turn w/ tool
console.log("\n— 3. tool-result round trip (model reads a tool result)");
try {
  const { status, json } = await call({
    model,
    messages: [
      { role: "user", content: "东京有合适的房源吗？" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "searchListings", arguments: '{"location":"Tokyo","guests":4}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: JSON.stringify({
          ok: true,
          total: 1,
          listings: [{ id: "abc", title: "中目黑站步行6分钟 · 雅致公寓", pricePerNight: 800, maxGuests: 4, nearSubway: true }],
        }),
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "searchListings",
          description: "根据目的地、人数和预算搜索真实房源",
          parameters: { type: "object", properties: { location: { type: "string" } }, required: [] },
        },
      },
    ],
    max_tokens: 300,
  });

  if (status !== 200) {
    failed = true;
    console.error(`  FAIL  HTTP ${status}: ${JSON.stringify(json).slice(0, 300)}`);
  } else {
    const content = json.choices?.[0]?.message?.content ?? "";
    console.log(`  PASS  模型基于工具结果作答: ${JSON.stringify(content.slice(0, 200))}`);
    if (!/800|中目黑|4/.test(content)) {
      console.log("  WARN  回答里没有引用工具返回的数据（请人工确认）");
    }
  }
} catch (error) {
  failed = true;
  console.error(`  FAIL  请求异常: ${error.message}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(failed ? "AI PROVIDER: FAILED" : "AI PROVIDER: READY (chat + tool calling OK)");
console.log("=".repeat(60));
process.exit(failed ? 1 : 0);
