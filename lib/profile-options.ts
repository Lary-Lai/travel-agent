/**
 * Options for the personalisable parts of a profile.
 *
 * Everything here is local on purpose. Cover presets are CSS gradients rather
 * than stock photos, and the suggestion lists are just strings — so a profile
 * renders identically offline and can never show a broken image or a failed
 * fetch. (The avatars taught that lesson the hard way: the previous preset
 * source, i.pravatar.cc, started answering 403 to every request.)
 */

/**
 * Banner gradients.
 *
 * Two rules hold this palette together:
 *
 *  1. **`key`s never change and labels never lie.** A saved profile stores the key,
 *     so reordering or renaming would silently repaint existing profiles, and a
 *     preset called "深海" that renders orange is worse than no preset at all.
 *     Colours were therefore adjusted *within* each name's meaning, and the coral
 *     one was moved to the front rather than renamed (it is `sunset`/日落, which is
 *     what a coral-to-amber gradient actually looks like).
 *  2. **Nothing neon.** The previous first entry was
 *     `from-indigo-500 via-purple-500 to-pink-500`, and because it was also the
 *     default it was the first thing anyone saw on a new profile — the saturated
 *     purple-to-magenta that reads as machine-generated rather than designed. Every
 *     preset is now either warm, or a deeper and less saturated version of itself.
 *
 * The default is the brand coral, so a fresh profile looks like part of this
 * product rather than like a placeholder.
 *
 * `className` must stay a literal string for Tailwind to see it.
 */
export type CoverPreset = {
  key: string;
  label: string;
  className: string;
};

export const COVER_PRESETS: CoverPreset[] = [
  {
    key: "sunset",
    label: "日落",
    // The default, and the only one that uses the brand token: coral through rose
    // to a light amber, i.e. the same light the rest of the product is lit by.
    className: "bg-gradient-to-br from-primary via-rose-400 to-amber-300",
  },
  {
    key: "sakura",
    label: "樱花",
    className: "bg-gradient-to-br from-rose-200 via-pink-300 to-rose-500",
  },
  {
    key: "desert",
    label: "沙丘",
    className: "bg-gradient-to-br from-amber-200 via-orange-400 to-rose-700",
  },
  {
    key: "aurora",
    label: "极光",
    className: "bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-900",
  },
  {
    key: "ocean",
    label: "深海",
    className: "bg-gradient-to-br from-sky-500 via-blue-700 to-slate-900",
  },
  {
    key: "forest",
    label: "森林",
    className: "bg-gradient-to-br from-emerald-500 via-teal-700 to-emerald-900",
  },
  {
    key: "mint",
    label: "薄荷",
    className: "bg-gradient-to-br from-emerald-200 via-teal-300 to-cyan-500",
  },
  {
    key: "midnight",
    label: "午夜",
    className: "bg-gradient-to-br from-slate-700 via-slate-900 to-black",
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
