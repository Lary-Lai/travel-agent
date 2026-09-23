/**
 * Options for the personalisable parts of a profile.
 *
 * Everything here is local on purpose. Cover presets are CSS gradients rather
 * than stock photos, and the suggestion lists are just strings — so a profile
 * renders identically offline and can never show a broken image or a failed
 * fetch. (The avatars taught that lesson the hard way: the previous preset
 * source, i.pravatar.cc, started answering 403 to every request.)
 */

/** Banner gradients. `className` must stay a literal string for Tailwind to see it. */
export type CoverPreset = {
  key: string;
  label: string;
  className: string;
};

export const COVER_PRESETS: CoverPreset[] = [
  {
    key: "aurora",
    label: "极光",
    className: "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500",
  },
  {
    key: "sunset",
    label: "日落",
    className: "bg-gradient-to-br from-orange-400 via-rose-500 to-purple-600",
  },
  {
    key: "ocean",
    label: "深海",
    className: "bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-800",
  },
  {
    key: "forest",
    label: "森林",
    className: "bg-gradient-to-br from-emerald-400 via-teal-600 to-cyan-800",
  },
  {
    key: "desert",
    label: "沙丘",
    className: "bg-gradient-to-br from-amber-300 via-orange-500 to-red-600",
  },
  {
    key: "sakura",
    label: "樱花",
    className: "bg-gradient-to-br from-pink-300 via-rose-400 to-fuchsia-600",
  },
  {
    key: "midnight",
    label: "午夜",
    className: "bg-gradient-to-br from-slate-700 via-slate-900 to-black",
  },
  {
    key: "mint",
    label: "薄荷",
    className: "bg-gradient-to-br from-lime-300 via-emerald-400 to-teal-600",
  },
];

export const DEFAULT_COVER_PRESET = COVER_PRESETS[0].key;

export function coverPresetOrDefault(key: string | null | undefined): CoverPreset {
  return COVER_PRESETS.find((preset) => preset.key === key) ?? COVER_PRESETS[0];
}

export function isCoverPreset(key: string): boolean {
  return COVER_PRESETS.some((preset) => preset.key === key);
}

/**
 * What to paint on the profile banner.
 * A custom image always wins; otherwise fall back to the chosen gradient.
 */
export function resolveCover(
  coverImage: string | null | undefined,
  coverPreset: string | null | undefined,
): { kind: "image"; url: string } | { kind: "gradient"; className: string } {
  if (coverImage) return { kind: "image", url: coverImage };
  return { kind: "gradient", className: coverPresetOrDefault(coverPreset).className };
}

// ---------------------------------------------------------------------- chips

/** Caps are enforced on the server; they keep a profile readable. */
export const MAX_CHIPS = {
  tags: 8,
  dreamDestinations: 12,
  hobbies: 10,
  visitedPlaces: 24,
} as const;

/** One chip this long is already a sentence; keep them short and scannable. */
export const MAX_CHIP_LENGTH = 20;

/**
 * Normalise a chip list: trim, drop empties, collapse duplicates
 * (case-insensitively, so "东京" and "东京 " cannot both appear), truncate
 * over-long entries, and cap the count.
 */
export function normaliseChips(values: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const value = raw.trim().slice(0, MAX_CHIP_LENGTH);
    if (!value) continue;

    const fingerprint = value.toLowerCase();
    if (seen.has(fingerprint)) continue;

    seen.add(fingerprint);
    out.push(value);
    if (out.length >= limit) break;
  }

  return out;
}

/** Suggestions offered in the editor. Free text is still allowed. */
export const TAG_SUGGESTIONS = [
  "摄影爱好者",
  "美食猎人",
  "咖啡因驱动",
  "城市漫步者",
  "背包客",
  "博物馆常客",
  "海边派",
  "计划控",
  "说走就走",
  "轻装出行",
  "深度旅行",
  "夜猫子",
];

export const HOBBY_SUGGESTIONS = [
  "徒步",
  "潜水",
  "滑雪",
  "做菜",
  "摄影",
  "骑行",
  "阅读",
  "跑步",
  "露营",
  "观星",
  "陶艺",
  "爵士乐",
];

export const DESTINATION_SUGGESTIONS = [
  "东京",
  "巴黎",
  "纽约",
  "伦敦",
  "首尔",
  "新加坡",
  "冰岛",
  "京都",
  "圣托里尼",
  "马拉喀什",
  "皇后镇",
  "布拉格",
];
