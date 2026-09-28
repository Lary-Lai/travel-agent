/**
 * Shared DTOs.
 *
 * The UI never sees raw Prisma rows: services map them into these shapes so the
 * client gets display-ready labels (Chinese city names, property-type labels,
 * resolved image URLs) and never leaks password hashes or host emails.
 */

/** Weather codes live with the weather vocabulary; see lib/weather.ts. */
import type { WeatherKind } from "../lib/weather";

export type PropertyTypeValue =
  | "APARTMENT"
  | "HOUSE"
  | "HOTEL"
  | "VILLA"
  | "LOFT"
  | "GUESTHOUSE";

export type BookingStatusValue = "PENDING" | "CONFIRMED" | "CANCELLED";

export const PROPERTY_TYPE_LABELS: Record<PropertyTypeValue, string> = {
  APARTMENT: "公寓",
  HOUSE: "独栋住宅",
  HOTEL: "酒店",
  VILLA: "别墅",
  LOFT: "LOFT",
  GUESTHOUSE: "民宿",
};

export const PROPERTY_TYPE_ICONS: Record<PropertyTypeValue, string> = {
  APARTMENT: "Building2",
  HOUSE: "Home",
  HOTEL: "Hotel",
  VILLA: "Palmtree",
  LOFT: "Warehouse",
  GUESTHOUSE: "Tent",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  PENDING: "待支付",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
};

/** Checkout channels shown on the payment page. */
export type PaymentMethodValue = "WECHAT" | "ALIPAY" | "CARD";
export const PAYMENT_METHODS: PaymentMethodValue[] = ["WECHAT", "ALIPAY", "CARD"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  WECHAT: "微信支付",
  ALIPAY: "支付宝",
  CARD: "银行卡",
};

export const PAYMENT_METHOD_HINTS: Record<PaymentMethodValue, string> = {
  WECHAT: "打开微信扫一扫，扫描二维码完成支付",
  ALIPAY: "打开支付宝扫一扫，扫描二维码完成支付",
  CARD: "支持 Visa / Mastercard / 银联借记卡与信用卡",
};

/** Refund lifecycle state. */
export type RefundStatusValue = "PROCESSING" | "SUCCEEDED" | "FAILED";

export const REFUND_STATUS_LABELS: Record<RefundStatusValue, string> = {
  PROCESSING: "退款处理中",
  SUCCEEDED: "退款成功",
  FAILED: "退款失败",
};

export type RefundDto = {
  id: string;
  bookingId: string;
  /** Amount returned to the original payment channel. */
  amount: number;
  status: RefundStatusValue;
  statusLabel: string;
  /** Which cancellation tier applied, e.g. FREE / PARTIAL / NONE. */
  tier: string;
  tierLabel: string;
  method: PaymentMethodValue;
  methodLabel: string;
  tradeNo: string | null;
  note: string | null;
  requestedAt: string;
  completedAt: string | null;
  /** True once the channel has settled the refund. */
  isSettled: boolean;
};

export const SORT_OPTIONS = ["recommended", "price_asc", "price_desc", "rating_desc"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_LABELS: Record<SortOption, string> = {
  recommended: "推荐排序",
  price_asc: "价格从低到高",
  price_desc: "价格从高到低",
  rating_desc: "评分优先",
};

/** A listing as rendered in grids and cards. */
export type ListingSummary = {
  id: string;
  title: string;
  location: string;
  city: string;
  cityLabel: string;
  countryLabel: string;
  pricePerNight: number;
  propertyType: PropertyTypeValue;
  propertyTypeLabel: string;
  rating: number;
  reviewCount: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  /** Primary (hero) image. */
  image: string;
  images: string[];
  amenityNames: string[];
  hostName: string;
  latitude: number;
  longitude: number;
};

export type ListingHost = {
  id: string;
  name: string;
  avatar: string | null;
  joinedAt: string;
  listingCount: number;
};

/** One photo plus the viewing angle it represents. */
export type ListingGalleryImage = {
  url: string;
  caption: string | null;
};

export type ListingAmenityDetail = {
  name: string;
  icon: string | null;
  category: string | null;
  /** Plain-language explanation shown when the guest taps the amenity. */
  description: string | null;
  /** How many listings in the same city also offer this amenity. */
  cityUsage: number;
};

/** Check-in / check-out logistics, shown in the 入住须知 panel. */
export type HouseRules = {
  checkInTime: string;
  checkOutTime: string;
  rules: string[];
  notes: string[];
};

/** Full listing payload for the detail page. */
export type ListingDetail = ListingSummary & {
  description: string;
  createdAt: string;
  host: ListingHost;
  /** Ordered gallery with captions (客厅 / 主卧 / 厨房 …). */
  gallery: ListingGalleryImage[];
  amenities: ListingAmenityDetail[];
  /** Denominator for `cityUsage` — total listings in this city. */
  cityListingCount: number;
  houseRules: HouseRules;
};

/** One guest review. */
export type ReviewDto = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  /** True for the caller's own review, so the UI can offer edit/delete. */
  isMine: boolean;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
};

/**
 * Reviews for one listing.
 *
 * `seeded` separates the historical aggregate baked into the listing row
 * (`rating` / `reviewCount`) from the reviews actually stored in the Review
 * table, so the UI can be honest about which numbers come from where.
 */
export type ReviewSummary = {
  average: number | null;
  count: number;
  /** Histogram of 1..5 stars for the stored reviews. */
  distribution: Array<{ stars: number; count: number }>;
  reviews: ReviewDto[];
  /** The caller's own review, if signed in and already reviewed. */
  myReview: ReviewDto | null;
  /** Reviews the listing claims from before this feature existed. */
  seededCount: number;
  seededRating: number;
};

/** A city the user's search history suggests they are interested in. */
export type PersonalizedDestination = {
  city: string;
  cityLabel: string;
  /** How many recorded searches mentioned this city. */
  hits: number;
  reason: string;
};

export type SearchInsights = {
  /** Most-searched cities, newest-weighted. */
  topCities: PersonalizedDestination[];
  totalSearches: number;
  lastSearchAt: string | null;
  /** Human-readable digest handed to the AI agent. */
  summary: string;
};

/** Normalised search input; every field is optional. */
export type ListingSearchInput = {
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  priceMin?: number;
  priceMax?: number;
  propertyType?: PropertyTypeValue;
  amenities?: string[];
  sort?: SortOption;
  page?: number;
  pageSize?: number;
};

export type ListingSearchResult = {
  items: ListingSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Echo of the normalised criteria actually applied. */
  applied: ListingSearchInput;
};

export type WishlistItemDto = {
  id: string;
  listingId: string;
  addedAt: string;
  listing: ListingSummary;
};

export type WishlistDto = {
  id: string;
  name: string;
  createdAt: string;
  itemCount: number;
  items: WishlistItemDto[];
};

export type BookingDto = {
  id: string;
  status: BookingStatusValue;
  statusLabel: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  roomPrice: number;
  cleaningFee: number;
  serviceFee: number;
  totalPrice: number;
  createdAt: string;
  /** Simulated payment state (no real gateway is integrated). */
  paymentMethod: PaymentMethodValue | null;
  paymentMethodLabel: string | null;
  paidAt: string | null;
  paymentTradeNo: string | null;
  isPaid: boolean;
  /** Present once a paid booking has been cancelled. */
  refund: RefundDto | null;
  listing: ListingSummary;
};

export type SessionUserDto = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  createdAt: string;
  /** Key into COVER_PRESETS, or null for the default gradient. */
  coverPreset: string | null;
  /** Custom banner image URL; takes precedence over coverPreset. */
  coverImage: string | null;
  /** Free-form self-description chips. */
  tags: string[];
  /** 心仪地点 — places the user wants to visit. */
  dreamDestinations: string[];
  /** 生活爱好 */
  hobbies: string[];
  /** 已旅行地点 — the display case. */
  visitedPlaces: string[];
};

/** Uniform API envelope. */
// ------------------------------------------------------------------ weather

export type WeatherCurrent = {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  kind: WeatherKind;
  description: string;
  /** lucide-react export name. */
  icon: string;
  isDay: boolean;
  observedAt: string;
};

export type WeatherDay = {
  date: string;
  weatherCode: number;
  kind: WeatherKind;
  description: string;
  icon: string;
  maxTemperature: number;
  minTemperature: number;
  precipitationProbability: number;
};

/** Current conditions plus a short forecast for one city. */
export type CityWeather = {
  city: string;
  cityLabel: string;
  countryLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current: WeatherCurrent;
  forecast: WeatherDay[];
  advice: string;
  fetchedAt: string;
  provider: string;
  /** True when served from the in-process cache. */
  cached: boolean;
  /** True when a fresh request failed and a stale reading was reused. */
  stale: boolean;
};

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
