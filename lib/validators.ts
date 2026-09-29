/**
 * Request validation.
 *
 * Mutations are validated strictly (a bad body is a 400). Search input is
 * coerced leniently — an unusable filter is dropped rather than failing the
 * whole query — but genuinely contradictory criteria (e.g. min > max price)
 * are still rejected.
 */
import { z } from "zod";

import { badRequest } from "./http";
import { isPresetAvatar } from "./avatars";
import { isUploadedMediaPath } from "./uploads";
import { MAX_GUESTS } from "./pricing";
import { isCoverPreset, MAX_CHIPS, normaliseChips } from "./profile-options";
import { SORT_OPTIONS, type ListingSearchInput, type PropertyTypeValue } from "../types";

export const propertyTypeSchema = z.enum([
  "APARTMENT",
  "HOUSE",
  "HOTEL",
  "VILLA",
  "LOFT",
  "GUESTHOUSE",
]);

export const sortSchema = z.enum(SORT_OPTIONS);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dateOnlySchema = z.string().regex(DATE_RE, "日期格式应为 YYYY-MM-DD");

/** Flatten URLSearchParams (repeated keys become arrays) into a plain object. */
export function searchParamsToObject(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key).filter((v) => v !== "");
    if (values.length === 0) continue;
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}

const firstString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const found = value.find((v) => typeof v === "string" && v.trim() !== "");
    return typeof found === "string" ? found.trim() : undefined;
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

const toNumber = (value: unknown): number | undefined => {
  const raw = firstString(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Turn raw query input into a validated search. Unknown keys are ignored.
 * Throws a 400 ApiError on contradictory criteria.
 */
export function parseListingSearch(input: Record<string, unknown>): ListingSearchInput {
  const out: ListingSearchInput = {};

  const location = firstString(input.location) ?? firstString(input.q);
  if (location) out.location = location.slice(0, 80);

  const checkIn = firstString(input.checkIn);
  const checkOut = firstString(input.checkOut);
  if (checkIn) {
    if (!DATE_RE.test(checkIn)) throw badRequest("入住日期格式不正确，应为 YYYY-MM-DD");
    out.checkIn = checkIn;
  }
  if (checkOut) {
    if (!DATE_RE.test(checkOut)) throw badRequest("退房日期格式不正确，应为 YYYY-MM-DD");
    out.checkOut = checkOut;
  }
  if (out.checkIn && out.checkOut && out.checkOut <= out.checkIn) {
    throw badRequest("退房日期必须晚于入住日期");
  }

  const guests = toNumber(input.guests);
  if (guests !== undefined) {
    if (guests < 1 || guests > MAX_GUESTS) {
      throw badRequest(`入住人数应在 1 - ${MAX_GUESTS} 之间`);
    }
    out.guests = Math.floor(guests);
  }

  const priceMin = toNumber(input.priceMin);
  const priceMax = toNumber(input.priceMax);
  if (priceMin !== undefined) {
    if (priceMin < 0) throw badRequest("最低价不能为负数");
    out.priceMin = Math.floor(priceMin);
  }
  if (priceMax !== undefined) {
    if (priceMax < 0) throw badRequest("最高价不能为负数");
    out.priceMax = Math.floor(priceMax);
  }
  if (out.priceMin !== undefined && out.priceMax !== undefined && out.priceMin > out.priceMax) {
    throw badRequest("最低价不能高于最高价");
  }

  const propertyType = firstString(input.propertyType);
  if (propertyType) {
    const parsed = propertyTypeSchema.safeParse(propertyType.toUpperCase());
    // An unknown property type is treated as "no filter" rather than an error.
    if (parsed.success) out.propertyType = parsed.data as PropertyTypeValue;
  }

  // Supports both `amenities=a,b` and repeated `amenities=a&amenities=b`.
  const rawAmenities = input.amenities;
  const amenityList = (
    Array.isArray(rawAmenities) ? rawAmenities : rawAmenities ? [rawAmenities] : []
  )
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);
  if (amenityList.length > 0) out.amenities = [...new Set(amenityList)].slice(0, 10);

  const sort = firstString(input.sort);
  if (sort) {
    const parsed = sortSchema.safeParse(sort);
    if (parsed.success) out.sort = parsed.data;
  }

  const page = toNumber(input.page);
  if (page !== undefined && page >= 1) out.page = Math.floor(page);

  const pageSize = toNumber(input.pageSize);
  if (pageSize !== undefined && pageSize >= 1) out.pageSize = Math.min(48, Math.floor(pageSize));

  return out;
}

// ---------------------------------------------------------------- mutations

export const registerSchema = z.object({
  name: z.string().trim().min(1, "请填写昵称").max(40, "昵称过长"),
  email: z.email("请输入有效的邮箱地址").max(120),
  password: z.string().min(8, "密码至少 8 位").max(72, "密码过长"),
});

export const loginSchema = z.object({
  email: z.email("请输入有效的邮箱地址"),
  password: z.string().min(1, "请输入密码"),
});

/**
 * An avatar may be: cleared (""), one of the bundled presets, a file this app
 * stored (`/api/media/...`), or an absolute http(s) URL.
 *
 * A bare `z.url()` is not enough: presets and uploads are same-origin paths, so
 * it would reject the two shapes the UI actually produces. Absolute URLs stay
 * accepted because a profile saved before local uploads existed still holds one.
 */
const avatarValueSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (value === "") return true;
      if (isPresetAvatar(value)) return true;
      if (isUploadedMediaPath(value)) return true;
      return z.url().safeParse(value).success;
    },
    { message: "头像必须是内置预设、本地上传的图片，或有效的图片链接" },
  )
  .transform((value) => (value === "" ? null : value));

/**
 * Same rule for the banner: cleared (""), an uploaded file, or an absolute
 * http(s) image URL.
 */
const coverImageSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" || isUploadedMediaPath(value) || z.url().safeParse(value).success,
    { message: "背景图必须是本地上传的图片，或以 http:// 或 https:// 开头的链接" },
  )
  .transform((value) => (value === "" ? null : value));

const chipListSchema = (limit: number) =>
  z
    .array(z.string())
    .max(limit, `最多 ${limit} 项`)
    .transform((values) => normaliseChips(values, limit));

/** Profile edit: identity, banner, and the personalisation chip lists. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "请填写昵称").max(40, "昵称不能超过 40 个字符"),
  avatar: avatarValueSchema.optional(),
  coverPreset: z
    .union([z.string().trim().refine(isCoverPreset, "未知的背景预设"), z.literal("")])
    .optional()
    // "" clears it; omitting the field leaves the stored value alone.
    .transform((value) => (value === "" ? null : value)),
  coverImage: coverImageSchema.optional(),
  tags: chipListSchema(MAX_CHIPS.tags).optional(),
  dreamDestinations: chipListSchema(MAX_CHIPS.dreamDestinations).optional(),
  hobbies: chipListSchema(MAX_CHIPS.hobbies).optional(),
  visitedPlaces: chipListSchema(MAX_CHIPS.visitedPlaces).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少 8 位").max(72, "密码过长"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: "新密码不能与当前密码相同",
    path: ["newPassword"],
  });

export const createWishlistSchema = z.object({
  name: z.string().trim().min(1, "请填写心愿单名称").max(60, "名称不能超过 60 个字符"),
});

export const renameWishlistSchema = createWishlistSchema;

export const wishlistItemSchema = z.object({
  listingId: z.string().trim().min(1, "缺少房源 id"),
});

export const createBookingSchema = z.object({
  listingId: z.string().trim().min(1, "缺少房源 id"),
  checkIn: dateOnlySchema,
  checkOut: dateOnlySchema,
  guests: z.coerce.number().int().min(1, "入住人数至少 1 人").max(MAX_GUESTS),
});

/** Simulated checkout: which channel the user picked. */
export const paymentMethodSchema = z.enum(["WECHAT", "ALIPAY", "CARD"]);

/**
 * A guest review. One per (listing, user) — the service upserts, so posting
 * again edits the existing review rather than adding a duplicate.
 */
export const saveReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "评分需要在 1 到 5 之间").max(5, "评分需要在 1 到 5 之间"),
  comment: z
    .string()
    .trim()
    .min(4, "评论至少 4 个字")
    .max(600, "评论不能超过 600 个字"),
});

/**
 * A search the user ran, recorded for personalisation.
 *
 * Everything is optional except `location`: a search with no destination carries
 * no signal about *where* the user wants to go, which is the only thing this
 * table is for.
 */
export const recordSearchSchema = z.object({
  location: z.string().trim().min(1, "缺少 destination").max(80),
  guests: z.coerce.number().int().min(1).max(MAX_GUESTS).optional(),
  priceMin: z.coerce.number().int().min(0).max(100_000).optional(),
  priceMax: z.coerce.number().int().min(0).max(100_000).optional(),
  propertyType: propertyTypeSchema.optional(),
});

export const payBookingSchema = z.object({
  method: paymentMethodSchema,
});

export const createWishlistItemSchema = z.object({
  wishlistId: z.string().trim().min(1).optional(),
  wishlistName: z.string().trim().min(1).max(60).optional(),
  listingId: z.string().trim().min(1, "缺少房源 id"),
});

export const agentMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1, "至少需要一条消息")
    .max(40, "对话过长，请开启新对话"),
});
