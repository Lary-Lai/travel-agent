# Next.js 16 Engineering Brief — App Router + Route Handlers + Cookie JWT Auth + TanStack Query + Tailwind v4

Source of truth: bundled docs at `travel-agent/node_modules/next/dist/docs/`. Every claim below cites its doc file.
Read from `01-app/02-guides/upgrading/version-16.md`, `01-app/01-getting-started/{15-route-handlers,06-fetching-data,07-mutating-data,11-css}.md`,
`01-app/03-api-reference/03-file-conventions/{route,page,proxy}.md`,
`01-app/03-api-reference/04-functions/{cookies,headers,use-search-params}.md`,
`01-app/02-guides/{authentication.md,client-side-data-fetching/tanstack-query.md}`.

---

## 1. BREAKING changes in Next 16 that hit App Router code

| # | Old (Next 15) | New (Next 16) | Cite |
| --- | --- | --- | --- |
| 1 | `cookies()`, `headers()`, `draftMode()` callable synchronously | Async only. Sync access **fully removed** | `version-16.md` §Async Request APIs |
| 2 | `params` sync in `layout/page/route/default/opengraph-image/twitter-image/icon/apple-icon` | Promise. Sync access removed | `version-16.md` §Async Request APIs |
| 3 | `searchParams` sync in `page.js` | Promise | `version-16.md` §Async Request APIs |
| 4 | `middleware.ts` + `export function middleware` | `proxy.ts` + `export function proxy`. `middleware` filename + named export deprecated. Proxy runtime is `nodejs`, **not configurable**; `edge` NOT supported in `proxy` | `version-16.md` §middleware to proxy; `proxy.md` §Runtime, §Version history |
| 5 | `skipMiddlewareUrlNormalize` | `skipProxyUrlNormalize` | `version-16.md` §middleware to proxy |
| 6 | `revalidateTag('posts')` | `revalidateTag('posts', 'max')` — 2nd cacheLife profile arg now **required**; 1-arg form deprecated and produces a TS error | `version-16.md` §revalidateTag |
| 7 | `unstable_cacheLife` / `unstable_cacheTag` | `cacheLife` / `cacheTag` (stable, no alias needed) | `version-16.md` §cacheLife and cacheTag |
| 8 | `experimental.ppr` + `export const experimental_ppr` | Removed. Opt in via top-level `cacheComponents: true` | `version-16.md` §PPR |
| 9 | `experimental.dynamicIO`, `experimental.useCache` | Removed. Migrate to top-level `cacheComponents` (not a rename-only change) | `version-16.md` §experimental.dynamicIO and experimental.useCache |
| 10 | `opengraph-image` / `icon`: `params` and `id` sync | `params` **and** `id` are Promises in the image function. `generateImageMetadata` still receives sync `params` | `version-16.md` §Async parameters for icon… |
| 11 | `sitemap({ id })` sync number | `id` is `Promise<string>` — `Number(await id)` | `version-16.md` §Async `id` parameter for sitemap |
| 12 | Parallel route slots without `default.js` | Build **fails**. All slots need explicit `default.js` | `version-16.md` §Parallel Routes `default.js` |
| 13 | `--turbopack` flag needed | Turbopack default for `next dev` **and** `next build`. `webpack` config ⇒ build **fails** unless `--webpack` | `version-16.md` §Turbopack by default |
| 14 | `experimental.turbopack` | top-level `turbopack` | `version-16.md` §Turbopack configuration location |
| 15 | `next lint` | Removed. `next build` no longer lints. `eslint` key in next.config removed | `version-16.md` §next lint Command |
| 16 | `serverRuntimeConfig` / `publicRuntimeConfig` + `getConfig()` | Removed. Use `process.env` (`NEXT_PUBLIC_` for client) | `version-16.md` §Runtime Configuration |
| 17 | `unstable_rootParams` | Removed → `next/root-params` | `version-16.md` §unstable_rootParams |
| 18 | AMP (`useAmp`, `amp` config, `export const config = { amp: true }`) | Removed | `version-16.md` §AMP Support |
| 19 | `devIndicators.appIsrStatus / buildActivity / buildActivityPosition` | Removed | `version-16.md` §devIndicators Options |
| 20 | Global `scroll-behavior: smooth` overridden during navigation | **No longer overridden**; add `data-scroll-behavior="smooth"` on `<html>` to restore | `version-16.md` §Scroll Behavior Override |
| 21 | Image defaults | `minimumCacheTTL` 60s → **14400s (4h)**; `16` removed from `imageSizes`; `qualities` → **`[75]` only**; local IP blocked; `maximumRedirects` → **3**; local images with `?query` need `images.localPatterns.search` | `version-16.md` §next/image changes |
| 22 | `next/legacy/image`, `images.domains` | Deprecated → `next/image`, `images.remotePatterns` | `version-16.md` |
| 23 | dev output in `.next` | `next dev` outputs to `.next/dev`; lockfile prevents duplicate dev/build | `version-16.md` §Concurrent dev and build |
| 24 | `process.argv` includes `'dev'` in next.config | `false` during `next dev`; use `NODE_ENV` or `phase` | `version-16.md` §next dev config load |
| 25 | `route.js` `preferredRegion` | Deprecated (still accepted) | `route.md` §Segment Config Options |
| 26 | ESLint legacy `.eslintrc` | `@next/eslint-plugin-next` defaults to Flat Config | `version-16.md` §ESLint Flat Config |
| 27 | Sass `~` tilde imports | Not supported by Turbopack | `version-16.md` §Sass node_modules imports |
| 28 | `size` / `First Load JS` in build output | Removed | `version-16.md` §Performance Improvements |

Runtime floors (`version-16.md` §Node.js runtime and browser support): **Node.js ≥ 20.9.0**, **TypeScript ≥ 5.1.0**, Chrome/Edge/Firefox 111+, Safari 16.4+.

Codemods: `npx @next/codemod@canary upgrade latest`, then `npx @next/codemod@canary next-async-request-api .` for sync request APIs, `npx @next/codemod@canary middleware-to-proxy .`, `npx @next/codemod@canary next-lint-to-eslint-cli .`. Generate typed helpers with `npx next typegen`.

---

## 2. Route Handlers

Cite: `15-route-handlers.md`, `route.md`.

### 2.1 File convention & signatures

`route.js|ts` inside `app/`. **Cannot** coexist with `page.js` at the same segment level (`route.md` §Route Resolution / `15-route-handlers.md` §Route Resolution).

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`. Unsupported method ⇒ `405` (`15-route-handlers.md` §Supported HTTP Methods). `OPTIONS` is auto-implemented with the correct `Allow` header if not defined (`route.md` §HTTP Methods).

```ts
// app/api/items/route.ts
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {}
export async function POST(request: NextRequest) {}
export async function PUT(request: NextRequest) {}
export async function PATCH(request: NextRequest) {}
export async function DELETE(request: NextRequest) {}
export async function HEAD(request: NextRequest) {}
export async function OPTIONS(request: NextRequest) {}
```

`request` is a `NextRequest` (extends Web `Request`); it is optional if unused (`route.md` §Parameters → request). Simplest form: `export async function GET() { return Response.json({ message: 'Hello World' }) }` (`route.md` top).

### 2.2 Second arg `params` — EXACT Next 16 typing (this changed)

`context.params` is a **Promise**. You must `await` it.

```ts
// Manual typing — app/dashboard/[team]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const { team } = await params
}
```

| Route | URL | `params` type |
| --- | --- | --- |
| `app/dashboard/[team]/route.js` | `/dashboard/1` | `Promise<{ team: '1' }>` |
| `app/shop/[tag]/[item]/route.js` | `/shop/1/2` | `Promise<{ tag: '1', item: '2' }>` |
| `app/blog/[...slug]/route.js` | `/blog/1/2` | `Promise<{ slug: ['1', '2'] }>` |
| `app/items/[slug]/route.js` | `/items/a` | `Promise<{ slug: 'a' }>` |

Preferred Next 16 style — the globally available `RouteContext` helper (no import; generated by `next dev` / `next build` / `next typegen`):

```ts
// app/users/[id]/route.ts
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

### 2.3 Reading searchParams (no Promise, no await)

Route Handlers do **not** get a `searchParams` prop. Read it off `request.nextUrl.searchParams`:

```ts
// app/api/search/route.ts
import { type NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams // URLSearchParams
  const query = searchParams.get('query') // "hello" for /api/search?query=hello
}
```

### 2.4 Reading a JSON body

```ts
export async function POST(request: Request) {
  const res = await request.json()
  return Response.json({ res })
}
```

FormData: `const formData = await request.formData(); formData.get('name')`. Webhook raw text: `await request.text()`. No `bodyParser` config needed, unlike Pages Router API Routes (`route.md` §Request Body, §FormData, §Webhooks).

### 2.5 Setting cookies on a response — two documented ways

**(a) `cookies()` in the handler** (`route.md` §Cookies):

```ts
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const a = cookieStore.get('a')
  cookieStore.set('b', '1')
  cookieStore.delete('c')
}
```

**(b) Raw `Set-Cookie` header on a new `Response`:**

```ts
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

Read cookies from the request without `cookies()`: `request.cookies.get('token')` (`route.md` §Cookies).

### 2.6 Other Route Handler facts

- **Caching**: Route Handlers are **not** cached by default; only `GET` can be opted into caching, via `export const dynamic = 'force-static'`. Other methods are never cached, even alongside a cached `GET` in the same file (`15-route-handlers.md` §Caching).
- Segment config available (`route.md` §Segment Config Options):
  ```ts
  export const dynamic = 'auto'
  export const dynamicParams = true
  export const revalidate = false
  export const fetchCache = 'auto'
  export const runtime = 'nodejs'
  export const preferredRegion = 'auto' // deprecated
  ```
- Redirect from a handler with `redirect()` from `next/navigation` (`route.md` §Redirects).
- CORS: return a `Response` with `Access-Control-*` headers; verify preflight `OPTIONS` yourself if you define it. Alternatively use `proxy.ts` or `next.config.js` headers (`route.md` §CORS).
- Auth must be enforced **inside** the handler; treat it as a public endpoint (`authentication.md` §Route Handlers):
  ```ts
  import { verifySession } from '@/app/lib/dal'

  export async function GET() {
    const session = await verifySession()
    if (!session) return new Response(null, { status: 401 })
    if (session.user.role !== 'admin') return new Response(null, { status: 403 })
  }
  ```

---

## 3. `cookies()` and `headers()`

Cite: `cookies.md`, `headers.md`.

**Yes, both are async in Next 16.** In 14 and earlier they were sync; Next 15 kept a temporary sync compat that Next 16 removed (`version-16.md` §Async Request APIs). Use `await`, or React's `use()` in a Client Component.

```tsx
// Read — Server Component
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')
}
```

```tsx
// Read — headers
import { headers } from 'next/headers'

export default async function Page() {
  const headersList = await headers()
  const userAgent = headersList.get('user-agent')
}
```

`headers()` returns a **read-only** Web `Headers`; you cannot set/delete outgoing request headers — return a new `Response` with `headers` instead (`headers.md` §Good to know, and `route.md` §Headers).

### 3.1 `cookies()` methods and options

| Method | Returns |
| --- | --- |
| `get('name')` | object `{ name, value }` |
| `getAll()` | array (optionally filtered by name) |
| `has('name')` | boolean |
| `set(name, value, options)` | — |
| `delete(name)` | — |
| `toString()` | string |

Options: `name`, `value`, `expires: Date`, `maxAge: number` (seconds), `domain`, `path` (default `'/'`), `secure`, `httpOnly`, `sameSite: boolean | 'lax' | 'strict' | 'none'`, `priority: 'low'|'medium'|'high'`, `partitioned`. Only `path` has a default (`cookies.md` §Options).

**Where you may write:**
- `.set()` / `.delete()` only in a **Server Function / Server Action** or a **Route Handler**. HTTP cannot set cookies after streaming starts.
- `.delete()` additionally requires the cookie to be from the same domain/protocol as `.set()` (exact subdomain match for wildcards).
- **Setting during Server Component rendering is not supported** — reading works, writing does not.

### 3.2 SET a cookie — exact usage

In a Server Action (`cookies.md` §Setting a cookie):

```ts
// app/actions.ts
'use server'
import { cookies } from 'next/headers'

export async function create(data) {
  const cookieStore = await cookies()

  cookieStore.set('name', 'lee')
  // or
  cookieStore.set('name', 'lee', { secure: true })
  // or
  cookieStore.set({
    name: 'name',
    value: 'lee',
    httpOnly: true,
    path: '/',
  })
}
```

In a Route Handler: identical `const cookieStore = await cookies(); cookieStore.set(...)` (`route.md` §Cookies).

Recommended JWT/session cookie shape (`authentication.md` §Setting cookies (recommended options)):

```ts
// app/lib/session.ts
import 'server-only'
import { cookies } from 'next/headers'

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const session = await encrypt({ userId, expiresAt }) // jose SignJWT
  const cookieStore = await cookies()

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: true,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}
```

### 3.3 DELETE a cookie — three documented forms

```ts
'use server'
import { cookies } from 'next/headers'

export async function deleteCookie(data) {
  const cookieStore = await cookies()
  cookieStore.delete('name')                       // (1) delete()
  // cookieStore.set('name', '')                   // (2) empty value
  // cookieStore.set('name', 'value', { maxAge: 0 }) // (3) immediate expiry, seconds
}
```

### 3.4 Side effects to know when writing cookies in a Server Action

Setting/deleting a cookie in a Server Action makes Next.js re-render the current page and its layouts on the server so the UI reflects the new value; the UI is **not** unmounted, and effects depending on server data re-run. To also refresh cached data, call `revalidatePath` or `revalidateTag` inside the function. Client state is preserved for re-rendered components (`cookies.md` §Understanding Cookie Behavior in Server Functions, `07-mutating-data.md` §Cookies).

---

## 4. Dynamic `params` / `searchParams` in pages

Cite: `page.md`, `version-16.md`.

Both are **Promises** and **must be awaited** (Server Component) or unwrapped with `use()` (Client Component).

Exact TypeScript types:

```ts
params: Promise<{ slug: string }>
searchParams: Promise<{ [key: string]: string | string[] | undefined }>
```

Full manual typing:

```tsx
// app/blog/[slug]/page.tsx
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = await params
  const filters = (await searchParams).filters
  return <h1>Blog Post: {slug}</h1>
}
```

Preferred Next 16 style — global `PageProps` helper (no import; generated by `next dev` / `next build` / `next typegen`; literal route enables autocomplete and strict keys; static routes resolve `params` to `{}`):

```tsx
// app/blog/[slug]/page.tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const query = await props.searchParams
  return <h1>Blog Post: {slug}</h1>
}
```

Client Component page (cannot be `async`):

```tsx
'use client'
import { use } from 'react'

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug } = use(params)
  const { query } = use(searchParams)
}
```

Notes:
- `searchParams` is a **plain object, not `URLSearchParams`** (`page.md`).
- Result shapes: `/shop?a=1` → `Promise<{ a: '1' }>`; `/shop?a=1&b=2` → `Promise<{ a: '1', b: '2' }>`; `/shop?a=1&a=2` → `Promise<{ a: ['1','2'] }>`.
- `searchParams` is a Request-time API: using it opts the page into **dynamic rendering** at request time.
- **Layouts do not receive `searchParams`** (`use-search-params.md` §Layouts).
- Server Components must **not** use `useSearchParams`; use the page `searchParams` prop and pass values down (`use-search-params.md`).
- `useSearchParams()` returns a read-only `URLSearchParams`, is **Client-only**, and must be wrapped in `<Suspense>` or the production build fails with the *Missing Suspense boundary with useSearchParams* error (`use-search-params.md` §Behavior → Prerendering).
- Auth in layouts is unsafe: layouts do not re-render on navigation, and a layout does not control whether the rest of the route renders (`authentication.md` §Layouts and auth checks). Do checks close to the data source.
- Do **not** rely on `useSearchParams` in a client page for auth-relevant state.

---

## 5. `proxy.ts` vs `middleware.ts`

Cite: `proxy.md`, `version-16.md` §middleware to proxy, `authentication.md` §Optimistic checks with Proxy.

- Next 16 convention is **`proxy.ts` / `proxy.js`**. `middleware.ts` is **deprecated** but is documented as still working (the docs say to keep using `middleware` only if you need the `edge` runtime).
- Location: project root **or** inside `src`, at the same level as `app` / `pages`. With custom `pageExtensions` use `proxy.page.ts`.
- Runtime is **`nodejs`** and **cannot be configured**; setting `runtime` in a Proxy file throws. `edge` is NOT supported in `proxy`.
- Export **a single function**: default export, or named `proxy`. Multiple proxies from one file are not supported.
- Config object for `matcher`.
- `matcher` values must be **constants** (statically analyzable).
- Execution order: next.config `headers` → next.config `redirects` → **Proxy** → `beforeFiles` rewrites → filesystem routes (`public/`, `_next/static/`, `app/`) → `afterFiles` rewrites → dynamic routes → `fallback` rewrites.
- Server Functions are **not separate routes** — they are POSTs to the route where used, so a matcher that excludes a path also skips Proxy for its Server Actions. Always verify auth inside each Server Function too.
- Even when `_next/data` is excluded by a negative matcher, Proxy **still runs** for `/_next/data` routes (intentional).
- Unit-test helpers: `unstable_doesProxyMatch`, `isRewrite`, `getRewrittenUrl` from `next/experimental/testing/server`.
- Type shorthand: `import type { NextProxy } from 'next/server'`.

Exact export signature (two args: `request: NextRequest`, `event: NextFetchEvent`):

```ts
// proxy.ts
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return NextResponse.redirect(new URL('/home', request.url))
}

export const config = { matcher: '/about/:path*' }
```

### 5.1 Working example: redirect unauthenticated users, allow specific paths

(Composed from `authentication.md` §Optimistic checks with Proxy and `proxy.md` §Matcher / §Negative matching.)

```ts
// proxy.ts  (project root, or src/proxy.ts)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/app/lib/session'

// Public paths that must stay reachable when unauthenticated
const publicRoutes = ['/login', '/signup', '/']
// Prefixes that are always allowed through (assets, api, etc.)
const alwaysAllowed = ['/api', '/_next/static', '/_next/image', '/favicon.ico']

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  if (alwaysAllowed.some((p) => path.startsWith(p))) {
    return NextResponse.next()
  }

  // Optimistic check only: read/decrypt the cookie, never hit the DB here.
  // Request-scoped reader documented in proxy.md §Using Cookies:
  const session = await decrypt(req.cookies.get('session')?.value)

  const isPublic = publicRoutes.includes(path)

  if (!isPublic && !session?.userId) {
    const url = new URL('/login', req.nextUrl)
    url.searchParams.set('from', path)
    return NextResponse.redirect(url)
  }

  if (isPublic && session?.userId && path !== '/') {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  // Skip static assets + image optimization + metadata files
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
```

Note: `authentication.md`'s Proxy example imports `cookies` from `next/headers` and does
`const cookie = (await cookies()).get('session')?.value`; `proxy.md` documents the request-scoped equivalent
`req.cookies.get('session')?.value` and calls out that "in Proxy, you can also read cookies using `req.cookies.get('session')?.value`" (`authentication.md` §Tips). Use one, not both.

Proxy cookie API (`proxy.md` §Using Cookies):
- Incoming: `request.cookies.get/getAll/has/delete/clear`.
- Outgoing: `const response = NextResponse.next(); response.cookies.set('vercel', 'fast')` (also accepts `{ name, value, path }`).
- Headers upstream: `NextResponse.next({ request: { headers: requestHeaders } })` — **not** `NextResponse.next({ headers })`, which leaks them to clients.

**Proxy is not a security boundary.** `proxy.md` and `authentication.md` both state the majority of checks must live next to the data source (DAL). `authentication.md` recommends `cache()`-wrapped `verifySession()` in a DAL and a DTO layer for what crosses to the client.

---

## 6. TanStack Query v5 in the App Router

Cite: `client-side-data-fetching/tanstack-query.md`, `06-fetching-data.md`.

**Yes — the provider must be a Client Component** (`'use client'`), because `QueryClientProvider` uses context/hooks. Put it in the nearest **shared layout** that needs it (not necessarily root).

**QueryClient-per-request caveat (documented verbatim as the pattern):** create a new `QueryClient` for each *server render* and reuse a single client instance in the browser. Never create one at module scope in a way shared across server requests, and never create it inside a component body (it would lose the browser cache every render).

```tsx
// app/products/providers.tsx
'use client'

import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  // Keep server requests isolated and preserve the browser cache across renders.
  if (typeof window === 'undefined') return new QueryClient()
  browserQueryClient ??= new QueryClient()
  return browserQueryClient
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}
```

```tsx
// app/products/layout.tsx
import { Providers } from './providers'

export default function Layout({ children }: LayoutProps<'/products'>) {
  return <Providers>{children}</Providers>
}
```

### 6.1 Client-only fetching

```tsx
'use client'
import { useQuery } from '@tanstack/react-query'

const { data = [], error, isPending } = useQuery({
  queryKey: ['product-search', query],
  queryFn: () => searchProducts(query),
  enabled: query.length > 0,
})
```

Suspense variant: `useSuspenseQuery` — the nearest `<Suspense>` owns the loading UI; the interactive shell stays outside the boundary. Initial failure propagates to the nearest error boundary. After data exists, refetches keep cached data rendered (no fallback flash); use `isFetching` for background feedback. Multiple `useSuspenseQuery` calls in one component run **sequentially** — split into siblings or use `useSuspenseQueries`.

### 6.2 Server-provided initial data (requires TanStack Query ≥ 5.40.0)

Start `prefetchQuery` **without awaiting**, dehydrate pending queries, override `queryFn` on the server because the Route Handler's relative URL only resolves in the browser. The Server Component and the Client Component must use the **same query key** — keep key + options in one shared contract module (`productCache`). Use `staleTime` (e.g. `30_000`) to avoid an immediate client refetch.

```ts
// app/products/[id]/product-cache.ts
import { queryOptions } from '@tanstack/react-query'

export type Product = { id: string; name: string }

export const productCache = {
  key: (id: string) => ['product', id] as const,
  options: (id: string) =>
    queryOptions({
      queryKey: productCache.key(id),
      queryFn: async (): Promise<Product> => {
        const res = await fetch(`/api/products/${id}`)
        if (!res.ok) throw new Error('Failed to fetch product')
        return res.json()
      },
      staleTime: 30_000,
    }),
}
```

```tsx
// app/products/[id]/page.tsx
import { Suspense } from 'react'
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query'

export default function Page({ params }: PageProps<'/products/[id]'>) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      {params.then(({ id }) => (
        <ProductData id={id} />
      ))}
    </Suspense>
  )
}

function ProductData({ id }: { id: string }) {
  const queryClient = new QueryClient()

  // Not awaited, so rendering is not blocked.
  void queryClient.prefetchQuery({
    ...productCache.options(id),
    queryFn: () => getProduct(id),
  })

  return (
    <HydrationBoundary
      state={dehydrate(queryClient, {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      })}
    >
      <ProductView id={id} />
    </HydrationBoundary>
  )
}
```

```tsx
// app/products/[id]/product-view.tsx
'use client'
import { useSuspenseQuery } from '@tanstack/react-query'
import { productCache } from './product-cache'

export function ProductView({ id }: { id: string }) {
  const { data } = useSuspenseQuery(productCache.options(id))
  return <h1>{data.name}</h1>
}
```

### 6.3 Mutations + coordinating the two caches

Add the matching server tag to the same contract (`tag: (id) => \`product:${id}\``), cache server reads with `'use cache'` + `cacheTag`, and call `updateTag(...)` in the Server Action. In the Client Component, `useMutation`'s `onMutate` updates the browser cache optimistically (cancel queries, snapshot previous, restore in `onError`).

```ts
// app/activity/actions.ts
'use server'
import { updateTag } from 'next/cache'
import { activityCache } from './activity-cache'

export async function markActivityReadAction() {
  const userId = await getCurrentUserId()
  await markActivityReadInDatabase(userId)
  updateTag(activityCache.tag(userId))
}
```

Caveats documented:
- With **Cache Components** enabled, `dehydrate()` reads the current time while prerendering and triggers a *current-time prerender error*. Use the documented `app/lib/hydrate.ts` hand-rolled `DehydratedState` builder instead (caches the timestamp under `'use cache'` + `cacheTag` + `cacheLife('max')` and passes the same tags).
- With Cache Components, Next.js also prerenders Client Components — keep a query needed during the initial render behind `<Suspense>`.
- TanStack Query owns a separate browser cache: its `staleTime` need not match `cacheLife`. Within a cache profile, `stale` controls client reuse of prefetched payloads; `revalidate`/`expire` control the server cache.

---

## 7. Tailwind CSS v4

Cite: `11-css.md` §Tailwind CSS.

Install (v4 packages — **no `tailwind.config.js` is created or required by the documented setup**):

```bash
npm install -D tailwindcss @tailwindcss/postcss
```

```js
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

**Exact CSS import line:**

```css
/* app/globals.css */
@import 'tailwindcss';
```

```tsx
// app/layout.tsx
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

Usage: `className="flex min-h-screen flex-col items-center justify-between p-24"`.

- Tailwind v3 setup (incl. `tailwind.config.js` and broader old-browser support) lives in a separate guide referenced only as `/docs/app/guides/tailwind-v3-css`; that file is **not documented in these files**.
- CSS ordering caveats (`11-css.md` §Ordering and Merging): order follows import order; import global/Tailwind styles at the app root; avoid auto-sorting imports (ESLint `sort-imports`); `cssChunking` in next.config controls chunking; global CSS is never removed on navigation (React stylesheet behavior), so keep it truly global.

**`@theme` theme tokens and v4 dark mode: not documented in these files.** The only dark-mode-adjacent statement in the read set is Tailwind's own utility usage; no `@theme`, `@theme inline`, `@custom-variant dark`, or token example appears in `11-css.md`. Do not invent syntax here — consult the Tailwind v4 docs.

---

## 8. Data fetching & caching defaults

Cite: `06-fetching-data.md`, `15-route-handlers.md`, `route.md`, `use-search-params.md`, `version-16.md` §Caching APIs.

- **Is `fetch` cached by default in Next 16? No.** "`fetch` requests are not cached by default and will block the page from rendering until the request is complete." Identical `fetch` calls **within one React component tree** are *memoized* (deduplicated), which is not the same as cached across requests (`06-fetching-data.md` §With the `fetch` API).
- **What replaced `dynamic = 'force-dynamic'` / `cache: 'no-store'`?** For intentionally dynamic pages, the docs say: "Previously, setting `export const dynamic = 'force-dynamic'` on the page was used to force dynamic rendering. **Prefer using `connection()`** instead, as it semantically ties dynamic rendering to the incoming request" (`use-search-params.md` §Dynamic Rendering).

  ```tsx
  import { connection } from 'next/server'

  export default async function Page() {
    await connection() // everything below is excluded from prerendering
    ...
  }
  ```

  How to opt a **page** into dynamic rendering, per these files:
  1. `await connection()` in a Server Component (`use-search-params.md`, `version-16.md` §Runtime Configuration).
  2. Read a Request-time API: `await cookies()`, `await headers()`, or the `searchParams` prop — "Using it in a layout or page will opt a route into dynamic rendering" (`cookies.md`, `headers.md`, `page.md`).
  3. Cache Components: any uncached/runtime data access must sit under `<Suspense>`, otherwise it blocks prerendering / raises a build error.

  Note: `cache: 'no-store'` is **not documented in these files**. The documented caching mechanism is the `'use cache'` directive plus `cacheLife`/`cacheTag`, or `export const revalidate` / `dynamic` segment config on pages and Route Handlers. `route.md`/`15-route-handlers.md` still document `export const dynamic = 'force-static' | 'auto'` and `export const revalidate = <seconds|false>` for Route Handlers.

- **Streaming**: `loading.js` streams the whole segment (it wraps `page.js` in a `<Suspense>` under `layout.js`). A layout that reads `cookies()`, `headers()`, or uncached data does **not** fall back to same-segment `loading.js` — it blocks navigation. Prefer `<Suspense>` placed close to the runtime/uncached access (`06-fetching-data.md` §With `loading.js`).
- **Dedup for non-`fetch` IO**: wrap the data function in React's `cache()`; it is scoped to a single request only (`06-fetching-data.md` §Reusing data with React.cache).
- **Preloading**: export a `preload` that calls the data function without `await`; the consumer's identical call reuses it (needs memoized `fetch`, `React.cache`, or `'use cache'` / `'use cache: private'`).
- **Sequential vs parallel**: layouts and pages render in parallel; consecutive `await`s inside one component serialize. Use `Promise.all`.

### 8.1 `revalidatePath`, `revalidateTag`, `updateTag`, `refresh`

- `revalidatePath('/posts')` — call it inside a Server Function after a mutation to revalidate the Next.js cache and show updated data (`07-mutating-data.md` §Revalidate data). Also the documented way to refresh cached data after a cookie write in a Server Function (`cookies.md`). **Exact signature beyond the single-argument call form is not documented in these files.**
- `revalidateTag('posts', 'max')` — **two arguments required in Next 16**; the second is a `cacheLife` profile. Single-arg form is deprecated and produces a TypeScript error. Semantics: stale-while-revalidate — readers see stale data while it revalidates in the background. Good for blog posts, catalogs, docs (`version-16.md` §revalidateTag).
- `updateTag(tag)` — **new in 16, Server-Actions-only**, gives read-your-writes semantics: expires and refreshes data **within the same request** so the user immediately sees the change. Use for forms, settings, anything the user expects to see reflected instantly. Documented call form is `updateTag(tag)` — options are **not documented in these files** (`version-16.md` §updateTag, `tanstack-query.md`). An uncached read has no server tag to update.
- `refresh()` from `next/cache` — refreshes the client router from within a Server Action (e.g. a notification badge). It **does not** revalidate tagged data; use `updateTag`/`revalidateTag` for that (`version-16.md` §refresh, `07-mutating-data.md` §Refresh data).
- `cacheLife` / `cacheTag` are stable: `import { cacheLife, cacheTag } from 'next/cache'` — drop the `unstable_` aliases.

---

## 9. React 19 items relevant to this stack

Cite: `version-16.md` §React 19.2, `authentication.md`, `07-mutating-data.md`, `06-fetching-data.md`, `page.md`, `headers.md`, `cookies.md`.

- App Router in Next 16 uses React **19.2** canary. New highlights: `ViewTransition`, `useEffectEvent`, `Activity`. Also upgrade `@types/react` / `@types/react-dom` (`version-16.md`).
- **`useActionState`** — canonical form/validation pattern:
  ```tsx
  'use client'
  import { useActionState } from 'react'

  const [state, action, pending] = useActionState(signup, undefined)

  return (
    <form action={action}>
      <input name="email" />
      {state?.errors?.email && <p>{state.errors.email}</p>}
      <button disabled={pending} type="submit">Sign Up</button>
    </form>
  )
  ```
  Server Action signature takes `(state, formData)`:
  ```ts
  export async function signup(state: FormState, formData: FormData) { /* validate, insert, createSession, redirect */ }
  ```
  It can also be invoked outside a form: `const [state, action, pending] = useActionState(createPost, false)` then `onClick={() => startTransition(action)}` (`07-mutating-data.md` §Showing a pending state).
- **`useFormStatus`** — in React 19 the returned object includes additional keys such as `data`, `method`, and `action`; before React 19 only `pending` was available (`authentication.md` §Good to know).
- **`use()`** — unwrap promises in Client Components. Relevant uses in these files: page `params`/`searchParams` (`page.md`), a Server-Component-passed data promise (`06-fetching-data.md` §Streaming data with the `use` API), `cookies()`/`headers()` without `async`.
- **`startTransition`** — wraps Server Action invocation from event handlers and `useEffect`; `useTransition()` gives `isPending`.
- React's `cache()` — per-request memoization for DAL/auth and ORM reads.
- Client Components **cannot** define Server Functions; import them from a `'use server'` module. Client Components also cannot import the DAL — run `verifySession()`/`getUser()` in a parent Server Component and pass data down as props or context; use `taintUniqueValue` to keep sensitive session fields off the client (`authentication.md` §Auth and streaming).
- Progressive enhancement: forms with Server Actions submit without JS (Server Components); Client Component forms queue submissions pre-hydration and do not refresh the browser after.
- `useOffline` (experimental): a Server Action interrupted by a connectivity drop stays pending and completes when the network returns (`07-mutating-data.md`).
- React 19 allows `<link rel="stylesheet" href="..." />` for stylesheets (`11-css.md`).

---

## 10. Notable deprecations / removals (checklist)

Removed: AMP (`useAmp`, `amp` config, page `config`), `next lint` + next.config `eslint` key, `serverRuntimeConfig`/`publicRuntimeConfig`/`next/config`, `experimental.dynamicIO`, `experimental.useCache`, experimental PPR (`experimental.ppr`, `experimental_ppr`), `unstable_rootParams`, `devIndicators.appIsrStatus`/`buildActivity`/`buildActivityPosition`, `size`/`First Load JS` build metrics.
Deprecated: `middleware` file + `middleware` named export (→ `proxy`), 1-arg `revalidateTag`, `next/legacy/image`, `images.domains`, `preferredRegion` segment config, legacy `.eslintrc` config.
Also: Turbopack is default; `webpack` config presence fails `next build` unless `--webpack`; Sass `~` imports unsupported; parallel-route slots require `default.js`; `next dev` writes to `.next/dev` and takes a project lockfile.

---

## 11. Not documented in these files (do not guess)

- Tailwind v4 `@theme` / theme tokens / CSS-first dark mode (`@custom-variant`) — nothing in `11-css.md`; only the v4 install, `postcss.config.mjs`, and `@import 'tailwindcss';`.
- Whether `tailwind.config.js` is *disallowed* — the doc simply never creates or references one; the v3 guide is a separate file not in this read set.
- Exact full signatures of `revalidatePath`, `revalidateTag` (beyond the 2-arg form), `updateTag`, `cacheLife`, `cacheTag`, `connection`, `refresh`, `generateStaticParams` (beyond what is quoted above).
- `fetch` options such as `cache: 'no-store'` / `next: { revalidate }` — not described in the read set; the documented mechanism is `'use cache'` + `cacheLife`/`cacheTag` and segment config.
- Client-side data fetching guide internals, Server Actions guide (single-roundtrip dispatch, security, deployment), streaming guide, cache-components migration guide, `backend-for-frontend` guide — referenced but not read.
- JWT specifics beyond the `jose` `SignJWT`/`jwtVerify` example in `authentication.md`.
