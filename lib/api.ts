/**
 * Typed client for the REST API.
 *
 * Every response goes through the same envelope, so a failure always surfaces
 * as an ApiClientError carrying the server's code + message — which is what the
 * UI renders in toasts and error states.
 */
import type {
  BoardDto,
  BookingDto,
  CityWeather,
  ForumPostsPayload,
  ForumSortValue,
  FriendDto,
  FriendsPayload,
  ListingDetail,
  ListingSearchInput,
  ListingSearchResult,
  PaymentMethodValue,
  PersonalizedDestination,
  PostDetailDto,
  PostDetailPayload,
  ProfilePrivacyDto,
  ProfileVisibilityValue,
  PublicProfileDto,
  PublicUserBrief,
  RefundDto,
  ReplyDto,
  ReviewDto,
  ReviewSummary,
  NotificationListDto,
  NotificationTypeValue,
  SessionUserDto,
  UploadedMediaDto,
  UploadKindValue,
  WishlistDto,
} from "@/types";

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function buildQuery(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
      continue;
    }
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, init.body ? { "Content-Type": "application/json" } : {});
}

/**
 * Multipart variant: the browser sets `Content-Type` including the generated
 * boundary, so this one must NOT set a content type of its own.
 */
async function requestForm<T>(path: string, body: FormData): Promise<T> {
  return send<T>(path, { method: "POST", body }, {});
}

async function send<T>(path: string, init: RequestInit, headers: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...headers, ...init.headers },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError("NETWORK_ERROR", "网络连接失败，请检查网络后重试", 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", "服务器返回了无法解析的响应", response.status);
  }

  const envelope = payload as { ok?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } };
  if (!envelope.ok || envelope.data === undefined) {
    const error = envelope.error ?? { code: "UNKNOWN", message: "请求失败" };
    throw new ApiClientError(error.code, error.message, response.status, error.details);
  }

  return envelope.data;
}

export const api = {
  // -------------------------------------------------------------- listings
  searchListings: (input: ListingSearchInput) =>
    request<ListingSearchResult>(`/api/listings${buildQuery(input as Record<string, unknown>)}`),

  getListing: (id: string) => request<ListingDetail>(`/api/listings/${encodeURIComponent(id)}`),

  getMeta: () =>
    request<{
      cities: Array<{
        city: string;
        cityLabel: string;
        countryLabel: string;
        count: number;
        minPrice: number;
        image: string;
      }>;
      amenities: Array<{ category: string; items: Array<{ name: string; icon: string | null }> }>;
      priceBounds: { min: number; max: number };
    }>("/api/meta"),

  /** Current conditions + short forecast for a city (Open-Meteo, no API key). */
  getCityWeather: (city: string) =>
    request<{ weather: CityWeather | null }>(`/api/weather${buildQuery({ city })}`),

  // ------------------------------------------------------------------ auth
  getSession: () => request<{ user: SessionUserDto | null }>("/api/auth/session"),

  login: (email: string, password: string) =>
    request<{ user: SessionUserDto }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    request<{ user: SessionUserDto }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  logout: () => request<{ signedOut: boolean }>("/api/auth/logout", { method: "POST" }),

  // --------------------------------------------------------------- profile
  /**
   * Update the profile. Email is intentionally not editable.
   * Fields that are omitted are left untouched by the server, so a save always
   * sends the whole object to keep the form and the stored row in step.
   */
  updateProfile: (input: {
    /** Omitted when saving only the personalisation section. */
    name?: string;
    avatar?: string;
    coverPreset?: string;
    coverImage?: string;
    tags?: string[];
    dreamDestinations?: string[];
    hobbies?: string[];
    visitedPlaces?: string[];
    /** Notification types to switch off; saved by its own section. */
    mutedNotificationTypes?: NotificationTypeValue[];
  }) =>
    request<{ user: SessionUserDto }>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  changeEmail: (input: { email: string; currentPassword: string }) =>
    request<{ user: SessionUserDto }>("/api/users/me/email", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    request<{ updated: boolean }>("/api/users/me/password", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --------------------------------------------------------- notifications
  listNotifications: () => request<NotificationListDto>("/api/notifications"),

  markNotificationsRead: (id?: string) =>
    request<{ unreadCount: number }>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify(id ? { id } : {}),
    }),

  // ------------------------------------------------------------- wishlists
  listWishlists: () => request<{ wishlists: WishlistDto[] }>("/api/wishlists"),

  createWishlist: (name: string) =>
    request<{ wishlist: WishlistDto }>("/api/wishlists", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  renameWishlist: (id: string, name: string) =>
    request<{ wishlist: WishlistDto }>(`/api/wishlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteWishlist: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/api/wishlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  addToWishlist: (wishlistId: string, listingId: string) =>
    request<{ wishlist: WishlistDto }>(`/api/wishlists/${encodeURIComponent(wishlistId)}/items`, {
      method: "POST",
      body: JSON.stringify({ listingId }),
    }),

  removeFromWishlist: (wishlistId: string, listingId: string) =>
    request<{ wishlist: WishlistDto }>(
      `/api/wishlists/${encodeURIComponent(wishlistId)}/items${buildQuery({ listingId })}`,
      { method: "DELETE" },
    ),

  getSaved: (listingId?: string) =>
    request<{ listingIds: string[]; wishlistsContaining: Array<{ id: string; name: string }> }>(
      `/api/saved${buildQuery({ listingId })}`,
    ),

  // -------------------------------------------------------------- bookings
  listBookings: () =>
    request<{
      bookings: BookingDto[];
      stats: {
        total: number;
        pending: number;
        upcoming: number;
        completed: number;
        totalSpend: number;
        totalNights: number;
        refunding: number;
        refunded: number;
      };
    }>("/api/bookings"),

  getBooking: (id: string) =>
    request<{ booking: BookingDto }>(`/api/bookings/${encodeURIComponent(id)}`),

  /** Preview the refund a cancellation would produce (no side effects). */
  getRefundQuote: (bookingId: string) =>
    request<{
      quote: {
        bookingId: string;
        tier: string;
        tierLabel: string;
        daysUntilCheckIn: number;
        roomRefund: number;
        cleaningRefund: number;
        serviceRefund: number;
        amount: number;
        totalPaid: number;
        refundable: boolean;
        description: string;
        alreadyCancelled: boolean;
      };
    }>(`/api/bookings/${encodeURIComponent(bookingId)}/refund-quote`),

  /** Simulated channel settlement: PROCESSING -> SUCCEEDED. */
  settleRefund: (refundId: string) =>
    request<{ refund: RefundDto }>(`/api/refunds/${encodeURIComponent(refundId)}/settle`, {
      method: "POST",
    }),

  createBooking: (input: { listingId: string; checkIn: string; checkOut: string; guests: number }) =>
    request<{ booking: BookingDto }>("/api/bookings", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Simulated checkout — no real gateway. */
  payBooking: (id: string, method: PaymentMethodValue) =>
    request<{ booking: BookingDto }>(`/api/bookings/${encodeURIComponent(id)}/pay`, {
      method: "POST",
      body: JSON.stringify({ method }),
    }),

  cancelBooking: (id: string) =>
    request<{ booking: BookingDto }>(`/api/bookings/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * Hide a finished order from the list. Deliberately not a delete: the refund
   * record cascades from the booking, so the row is archived and kept.
   */
  archiveBooking: (id: string) =>
    request<{ archived: boolean }>(`/api/bookings/${encodeURIComponent(id)}/archive`, {
      method: "POST",
    }),

  /** Clear every cancelled order at once; resolves with how many were hidden. */
  archiveCancelledBookings: () =>
    request<{ count: number }>("/api/bookings/archive-cancelled", { method: "POST" }),

  // --------------------------------------------------------------- reviews
  /** Public: reviews are readable without an account. */
  listReviews: (listingId: string) =>
    request<ReviewSummary>(`/api/listings/${encodeURIComponent(listingId)}/reviews`),

  /** Upserts — posting twice edits your existing review instead of duplicating. */
  saveReview: (listingId: string, input: { rating: number; comment: string }) =>
    request<{ review: ReviewDto; summary: ReviewSummary }>(
      `/api/listings/${encodeURIComponent(listingId)}/reviews`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  deleteReview: (listingId: string) =>
    request<{ summary: ReviewSummary }>(
      `/api/listings/${encodeURIComponent(listingId)}/reviews`,
      { method: "DELETE" },
    ),

  // ------------------------------------------------------- personalisation
  /** Fire-and-forget: a signed-out caller is a no-op, not an error. */
  recordSearch: (input: {
    location: string;
    guests?: number;
    priceMin?: number;
    priceMax?: number;
    propertyType?: string;
  }) =>
    request<{ recorded: boolean; reason?: string }>("/api/search-events", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getPersonalizedDestinations: () =>
    request<{
      personalised: boolean;
      totalSearches: number;
      summary: string;
      destinations: PersonalizedDestination[];
      source: "history" | "popular";
    }>("/api/recommendations/destinations"),

  // ================================================================ uploads
  // Owned by the media/upload workstream. Methods below this banner are that
  // workstream's; keep edits inside it so parallel writers never collide.
  /**
   * Upload a local image and get back a same-origin path to store.
   *
   * Separate from `request` because the browser must set the multipart boundary
   * itself — forcing `Content-Type: application/json` here would corrupt it.
   */
  uploadImage: (file: File, kind: UploadKindValue) => {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    return requestForm<UploadedMediaDto>("/api/uploads", body);
  },

  // ================================================================= social
  // Owned by the social workstream (visibility, public profiles, friends).
  /** Your own visibility settings, including both exception lists. */
  getPrivacy: () => request<ProfilePrivacyDto>("/api/users/me/privacy"),

  savePrivacy: (input: {
    visibility: ProfileVisibilityValue;
    allow: string[];
    deny: string[];
  }) =>
    request<ProfilePrivacyDto>("/api/users/me/privacy", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  /** People picker used by the visibility dialog and by "find friends". */
  searchUsers: (query: string) =>
    request<{ users: PublicUserBrief[] }>(
      `/api/users/search${buildQuery({ q: query })}`,
    ),

  /** Another person's profile. Returns `canView: false` rather than 403. */
  getPublicProfile: (id: string) =>
    request<PublicProfileDto>(`/api/users/${encodeURIComponent(id)}`),

  listFriends: () => request<FriendsPayload>("/api/friends"),

  sendFriendRequest: (userId: string) =>
    request<{ friend: FriendDto }>("/api/friends", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  respondToFriendRequest: (friendshipId: string, action: "accept" | "decline") =>
    request<{ friend: FriendDto }>(`/api/friends/${encodeURIComponent(friendshipId)}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  removeFriend: (friendshipId: string) =>
    request<{ removed: boolean }>(`/api/friends/${encodeURIComponent(friendshipId)}`, {
      method: "DELETE",
    }),

  // ================================================================== forum
  // Owned by the forum workstream.
  listBoards: () => request<{ boards: BoardDto[] }>("/api/forum/boards"),

  listPosts: (input: {
    board?: string;
    sort?: ForumSortValue;
    q?: string;
    city?: string;
    mine?: boolean;
  }) => request<ForumPostsPayload>(`/api/forum/posts${buildQuery(input)}`),

  getPost: (id: string) =>
    request<PostDetailPayload>(`/api/forum/posts/${encodeURIComponent(id)}`),

  createPost: (input: { boardSlug: string; title: string; body: string; city?: string }) =>
    request<{ post: PostDetailDto }>("/api/forum/posts", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createReply: (postId: string, body: string) =>
    request<{ reply: ReplyDto; replyCount: number }>(
      `/api/forum/posts/${encodeURIComponent(postId)}/replies`,
      { method: "POST", body: JSON.stringify({ body }) },
    ),

  deletePost: (id: string) =>
    request<{ deleted: boolean }>(`/api/forum/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  deleteReply: (id: string) =>
    request<{ deleted: boolean }>(`/api/forum/replies/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
