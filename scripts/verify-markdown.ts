/**
 * Unit tests for the Agent's Markdown subset.
 *
 * The fixture is a real reply shape the model produces (taken from a live
 * session), which is what surfaced the bug: `**bold**` markers were reaching the
 * user as literal asterisks.
 *
 * Run with: npx tsx scripts/verify-markdown.ts
 */
import { parseMarkdown, stripMarkdown, tokenizeInline } from "../lib/agent-markdown";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --------------------------------------------------------------- inline tokens
console.log("\n— inline formatting");

const bold = tokenizeInline("**金丝雀码头站步行5分钟·静谧公寓**：每晚¥770");
check("bold is tokenized", bold[0]?.type === "bold", JSON.stringify(bold[0]));
check("bold content keeps no asterisks", bold[0]?.value === "金丝雀码头站步行5分钟·静谧公寓", bold[0]?.value);
check(
  "text after bold is preserved",
  bold.slice(1).every((t) => t.type === "text") &&
    bold.map((t) => t.value).join("") === "金丝雀码头站步行5分钟·静谧公寓：每晚¥770",
  bold.map((t) => t.value).join(""),
);

const italic = tokenizeInline("这是*重点*内容");
check("italic is tokenized", italic.some((t) => t.type === "italic" && t.value === "重点"));

const code = tokenizeInline("运行 `npm run dev` 启动");
check("inline code is tokenized", code.some((t) => t.type === "code" && t.value === "npm run dev"));

const link = tokenizeInline("详见 [东京房源](https://example.com/a)");
const linkToken = link.find((t) => t.type === "link");
check("links are tokenized", linkToken?.type === "link" && linkToken.href === "https://example.com/a");

check(
  "plain text passes through untouched",
  tokenizeInline("没有任何标记的一句话").length === 1,
);

// ------------------------------------------------------------- block parsing
console.log("\n— block parsing");

const mixed = `**第 1 个：金丝雀码头站步行5分钟·静谧公寓**
- 位置：金丝雀码头
- 每晚 ¥770，评分 4.96
- 亮点：**最靠近水岸**

**第 2 个：国王十字站步行2分钟·静谧公寓**
- 每晚 ¥880

1. 先选日期
2. 再选人数`;

const blocks = parseMarkdown(mixed);
check("paragraphs, bullet lists and ordered lists are all detected",
  blocks.some((b) => b.kind === "paragraph") &&
    blocks.some((b) => b.kind === "list" && !b.ordered) &&
    blocks.some((b) => b.kind === "list" && b.ordered),
  blocks.map((b) => b.kind).join(","));

const bulletLists = blocks.filter((b) => b.kind === "list" && !b.ordered);
const totalBullets = bulletLists.reduce((sum, b) => sum + (b.kind === "list" ? b.items.length : 0), 0);
check("bullet items total 4", totalBullets === 4, String(totalBullets));
check(
  "a blank line + paragraph correctly splits two bullet lists",
  bulletLists.length === 2,
  `${bulletLists.length} lists`,
);

const ordered = blocks.find((b) => b.kind === "list" && b.ordered);
check("ordered list collects every item", ordered?.kind === "list" && ordered.items.length === 2,
  String(ordered?.kind === "list" ? ordered.items.length : "?"));

const headings = parseMarkdown("### 小标题\n正文");
check("headings are detected with their level",
  headings[0]?.kind === "heading" && headings[0].level === 3, JSON.stringify(headings[0]));

// A line that is only bold must NOT be treated as a bullet.
const onlyBold = parseMarkdown("**标题行**");
check("a bold-only line stays a paragraph (not a bullet)",
  onlyBold.length === 1 && onlyBold[0].kind === "paragraph", JSON.stringify(onlyBold[0]));

// ------------------------------------------------------- the actual complaint
console.log("\n— the reported bug: asterisks leaking to the user");

const stripped = stripMarkdown(mixed);
check("no asterisk survives rendering", !stripped.includes("*"), JSON.stringify(stripped.slice(0, 120)));
check("no backtick survives rendering", !stripped.includes("`"));
check("content is not lost", stripped.includes("金丝雀码头") && stripped.includes("每晚 ¥770"));

// Every text token in a rendered reply must be free of markers too.
const inlineTokens = [
  ...tokenizeInline("**甲**和*乙*还有`丙`"),
];
check(
  "no token value contains a stray marker",
  inlineTokens.every((t) => !/\*|`/.test("value" in t ? t.value : "")),
  JSON.stringify(inlineTokens),
);

// ------------------------------------------------------------------- edge cases
console.log("\n— edge cases");

check("empty input yields no blocks", parseMarkdown("").length === 0);
check("whitespace-only input yields no blocks", parseMarkdown("   \n\n  ").length === 0);
check(
  "unmatched marker is left as text",
  tokenizeInline("价格 ** 未标注").some((t) => t.type === "text" && t.value.includes("**")),
);
check("bold spanning a whole line works", tokenizeInline("**全部加粗**")[0]?.type === "bold");

console.log(`\n${"=".repeat(60)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
if (failures.length > 0) {
  console.log("\nfailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}
console.log("=".repeat(60));
process.exit(failed > 0 ? 1 : 0);
