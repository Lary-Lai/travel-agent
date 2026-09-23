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
import { MAX_GUESTS } from "./pricing";
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
