/**
 * Restore the demo account after a manual probe changed its name/avatar, and
 * verify the profile personalisation endpoints end to end.
 *
 *     node scripts/check-profile-fields.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3001";
const DEMO_EMAIL = "demo@travel-agent.dev";
const DEMO_PASSWORD = "Demo1234";

/** Mirrors presetAvatarFor() in lib/avatars.ts (FNV-1a, 12 presets). */
function presetAvatarFor(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `/avatars/avatar-${(((hash >>> 0) % 12) + 1)}.svg`;
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), headers: r.headers }));

const patch = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// ------------------------------------------------------------- restore demo
const login = await post("/api/auth/login", { email: DEMO_EMAIL, password: DEMO_PASSWORD });
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
check("demo account can log in", login.status === 200, `got ${login.status}`);

const restored = await patch(
  "/api/users/me",
  { name: "演示用户", avatar: presetAvatarFor(DEMO_EMAIL), coverPreset: "aurora" },
  cookie,
);
check("demo account restored", restored.status === 200, `got ${restored.status}`);
check(
  "demo name is 演示用户",
  restored.body?.data?.user?.name === "演示用户",
  restored.body?.data?.user?.name,
);
check(
  "demo preset avatar accepted",
  restored.body?.data?.user?.avatar === presetAvatarFor(DEMO_EMAIL),
  `got ${restored.body?.data?.user?.avatar}`,
);

// ------------------------------------------------ the bug this run is about
console.log("\n— preset avatars are accepted (they are same-origin paths, not URLs)");
const presetPatch = await patch(
  "/api/users/me",
  { name: "演示用户", avatar: "/avatars/avatar-7.svg" },
  cookie,
);
check("PATCH with a bundled preset avatar -> 200", presetPatch.status === 200, `got ${presetPatch.status}`);
check(
  "preset avatar persisted",
  presetPatch.body?.data?.user?.avatar === "/avatars/avatar-7.svg",
  `got ${presetPatch.body?.data?.user?.avatar}`,
);

const bogusPreset = await patch(
  "/api/users/me",
  { name: "演示用户", avatar: "/avatars/avatar-999.svg" },
  cookie,
);
check("unknown preset path -> 400", bogusPreset.status === 400, `got ${bogusPreset.status}`);

const foreignPath = await patch("/api/users/me", { name: "演示用户", avatar: "/etc/passwd" }, cookie);
check("arbitrary same-origin path -> 400", foreignPath.status === 400, `got ${foreignPath.status}`);

// ------------------------------------------------------- personalisation
console.log("\n— personalisation fields");
const saved = await patch(
  "/api/users/me",
  {
    name: "演示用户",
    tags: [" 摄影爱好者 ", "咖啡因驱动", "摄影爱好者"],
    dreamDestinations: ["冰岛", "京都"],
    hobbies: ["徒步", "潜水"],
    visitedPlaces: ["东京", "巴黎", "曼谷"],
    coverPreset: "sunset",
  },
  cookie,
);
const savedUser = saved.body?.data?.user;
check("save personalisation -> 200", saved.status === 200, `got ${saved.status}`);
check(
  "tags trimmed and de-duplicated",
  JSON.stringify(savedUser?.tags) === JSON.stringify(["摄影爱好者", "咖啡因驱动"]),
  JSON.stringify(savedUser?.tags),
);
check("dreamDestinations persisted", JSON.stringify(savedUser?.dreamDestinations) === JSON.stringify(["冰岛", "京都"]), JSON.stringify(savedUser?.dreamDestinations));
check("hobbies persisted", JSON.stringify(savedUser?.hobbies) === JSON.stringify(["徒步", "潜水"]));
check("visitedPlaces persisted", savedUser?.visitedPlaces?.length === 3, JSON.stringify(savedUser?.visitedPlaces));
check("coverPreset persisted", savedUser?.coverPreset === "sunset", savedUser?.coverPreset);

// Omitted fields must survive a later partial save.
const partial = await patch("/api/users/me", { name: "演示用户", hobbies: ["观星"] }, cookie);
const partialUser = partial.body?.data?.user;
check("partial save keeps the banner", partialUser?.coverPreset === "sunset", partialUser?.coverPreset);
check("partial save keeps tags", partialUser?.tags?.length === 2, JSON.stringify(partialUser?.tags));
check("partial save keeps visitedPlaces", partialUser?.visitedPlaces?.length === 3);
check("partial save updated hobbies", JSON.stringify(partialUser?.hobbies) === JSON.stringify(["观星"]));

const badCover = await patch("/api/users/me", { name: "演示用户", coverPreset: "nope" }, cookie);
check("unknown cover preset -> 400", badCover.status === 400, `got ${badCover.status}`);

const badCoverImage = await patch(
  "/api/users/me",
  { name: "演示用户", coverImage: "javascript:alert(1)" },
  cookie,
);
check("non-URL cover image -> 400", badCoverImage.status === 400, `got ${badCoverImage.status}`);

const tooMany = await patch(
  "/api/users/me",
  { name: "演示用户", tags: Array.from({ length: 30 }, (_, i) => `标签${i}`) },
  cookie,
);
check("over-long tag list -> 400", tooMany.status === 400, `got ${tooMany.status}`);

const tooLong = await patch(
  "/api/users/me",
  { name: "演示用户", hobbies: ["x".repeat(50)] },
  cookie,
);
check(
  "over-long chip is truncated, not rejected",
  tooLong.body?.data?.user?.hobbies?.[0]?.length === 20,
  String(tooLong.body?.data?.user?.hobbies?.[0]?.length),
);

// Session must expose the new fields so the UI can render them.
const session = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie } }).then((r) =>
  r.json(),
);
check("session exposes tags", Array.isArray(session.data?.user?.tags));
check("session exposes visitedPlaces", Array.isArray(session.data?.user?.visitedPlaces));
check("session exposes coverPreset", typeof session.data?.user?.coverPreset === "string");

// ---------------------------------------------- final tidy: demo showcase data
const showcase = await patch(
  "/api/users/me",
  {
    name: "演示用户",
    avatar: presetAvatarFor(DEMO_EMAIL),
    coverPreset: "aurora",
    tags: ["摄影爱好者", "城市漫步者", "咖啡因驱动"],
    dreamDestinations: ["冰岛", "京都", "圣托里尼"],
    hobbies: ["徒步", "潜水", "阅读"],
    visitedPlaces: ["东京", "巴黎", "曼谷", "首尔", "新加坡"],
  },
  cookie,
);
check("demo profile left in a presentable state", showcase.status === 200, `got ${showcase.status}`);

console.log(`\n${"=".repeat(48)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(48));
process.exit(failed === 0 ? 0 : 1);
