/**
 * Shared DTOs.
 *
 * The UI never sees raw Prisma rows: services map them into these shapes so the
 * client gets display-ready labels (Chinese city names, property-type labels,
 * resolved image URLs) and never leaks password hashes or host emails.
 */

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
  PENDING: "待确认",
  CONFIRMED: "已确认",
  CANCELLED: "已取消",
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

/** Full listing payload for the detail page. */
export type ListingDetail = ListingSummary & {
  description: string;
  createdAt: string;
  host: ListingHost;
  amenities: Array<{ name: string; icon: string | null; category: string | null }>;
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
  listing: ListingSummary;
};

export type SessionUserDto = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  createdAt: string;
};

/** Uniform API envelope. */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
