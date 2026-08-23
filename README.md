# Roam Route Planner

A travel route planning tool with deep route-editing capabilities: automatic route generation, freehand drawing, road-snapping adjustments, multi-day itineraries, and short-link sharing. Ships as a **pnpm monorepo**: Next.js web app + Expo (React Native) iOS/Android app sharing one TypeScript domain core.

## Features

- **Place search & map click**: AMap POI search or click directly on the map; places added by clicking are named automatically via reverse geocoding
- **Automatic route planning**: real road routes between adjacent places, with per-segment travel modes — driving / walking / cycling / transit (bus & metro, with walking transfer segments rendered separately)
- **Smart mode suggestion**: mode auto-suggested by distance (walking <1.5 km, cycling 1.5–8 km, driving >8 km)
- **Freehand drawing**: hold and drag to draw a line; endpoints snap to nearby places (<100 m) or create new ones *(web; mobile pending native gesture module, see Mobile → Known gaps)*
- **Vertex snapping**: select a segment and drag its vertices to reshape it; the segment is then marked as manually edited *(web only for now)*
- **Multi-day itineraries**: organize places by day, drag to reorder, rename days, move places between days, per-place notes
- **Undo/redo** (Ctrl+Z) and debounced auto-save
- **Resilience**: failed route planning degrades to a straight line with a retry badge; per-segment status tracking
- **Sharing**: read-only short-link page with per-day place cards, live weather per day, and full-route animated playback
- **Mobile (Expo)**: offline-first local storage + sync engine (push/pull delta, trip-level conflict resolution), device-token identity with optional account pairing (`/pair`), POI search, multi-day editing, route playback

## Tech Stack

- **Monorepo**: pnpm workspaces — `apps/web`, `apps/mobile`, `packages/core` (shared domain logic), `packages/api-client`
- Web: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4
- Mobile: Expo SDK 57 (React Native) + expo-router + expo-sqlite (offline-first) + react-native-amap3d
- AMap (高德): JS API 2.0 on web; native iOS/Android SDK on mobile; Web Service API proxied server-side only
- Neon Postgres + Drizzle ORM; falls back to in-memory storage when `DATABASE_URL` is unset (non-production)
- Zustand for client state on both apps; Vitest unit tests; Playwright web E2E

## Architecture

### Data model

A single `trips` table with a JSONB `data` column; every save writes a full snapshot (atomic, no concurrency conflicts):

```
trips
├─ id          UUID
├─ share_id    nanoid(16) → /t/{share_id}
├─ owner_id    anonymous cookie UUID (edit permission)
├─ title
├─ created_at / updated_at
└─ data        JSONB
   ├─ days:      [{ id, name, note }]
   ├─ stops:     [{ id, dayId, name, lat, lng, category, note, order }]
   └─ segments:  [{ id, fromStop, toStop, mode, kind, geometry: LineString,
                    distanceM, durationMin, parts?, degraded? }]
```

- `mode`: `driving` | `walking` | `cycling` | `transit`
- `kind`: `auto` (planned route) | `freehand` (drawn line) | `snapped` (manually adjusted)
- `parts`: transit segments split into bus (solid) + walking (dashed) sub-segments for rendering
- `degraded`: planning failed, rendered as a straight line (amber dashed) until retried

### Editor core

A route is a sequence of places plus one geometry per segment; every operation is a local, immutable modification of that sequence (`src/lib/trip/ops.ts`). Immutability enables O(1) undo/redo via structural sharing — history entries hold references, no deep copies.

- Route requests run with concurrency 3; stale responses are discarded by a guard that checks segment existence, mode, and endpoints
- Per-segment status (`pending` / `ok` / `error`) — a failed segment never blocks the rest of the map
- Auto-save: 1.5 s debounce → PATCH full snapshot; in-flight saves are coalesced and re-triggered if changes arrive during a save
- During draw/snap the map pan is locked (two-finger zoom still works); a chip toggles the lock

### Backend API

| Endpoint | Purpose |
|---|---|
| `POST /api/trips` | create a trip (anonymous owner cookie) |
| `GET /api/trips/[id]` | load a trip (owner only) |
| `PATCH /api/trips/[id]` | save full snapshot (owner only) |
| `DELETE /api/trips/[id]` | delete a trip (owner only) |
| `GET /api/trips/share/[shareId]` | public read-only access (no auth) |
| `GET /api/recent` | recent trips of the owner |
| `POST /api/claim` | set nickname (share-page attribution) |
| `GET /api/nickname` | read nickname |
| `POST /api/route` | route planning (server-side AMap call) |
| `GET /api/search` | AMap POI search |
| `GET /api/regeocode` | reverse geocoding (auto-naming, city inference) |
| `GET /api/weather` | live weather for a city |
| `GET /api/amap-proxy/[...path]` | JS API security proxy (adds `jscode` server-side) |

### Caching & degradation

- In-process route cache: 7-day TTL, LRU (500 entries)
- In-process LBS cache: reverse geocoding 1 h, weather 10 min (2,000 entries)
- Route failure → straight-line fallback + retry badge; cross-city transit → `no_route` degradation

### Security

- Anonymous identity via httpOnly cookie (1-year); PATCH/DELETE verify ownership
- `share_id` (nanoid 16) is unguessable; reads are unauthenticated by design (read-only sharing)
- The AMap Web Service key is server-only; the JS API security secret never reaches the browser in production (proxied via `/api/amap-proxy`)

## Local Development

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Neon and AMap variables
pnpm db:migrate                                # apply committed migrations
pnpm dev
```

Environment variables:

- `DATABASE_URL` — Neon Postgres connection string (optional locally; without it the app uses in-memory storage)
- `AMAP_WEB_SERVICE_KEY` — AMap Web Service API key (server-only)
- `NEXT_PUBLIC_AMAP_JS_API_KEY` — AMap JS API key (public; restrict to your domain in the AMap console)
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` — JS API security secret (development only, plaintext)
- `NEXT_PUBLIC_AMAP_PROXY=true` + `AMAP_SECURITY_JS_CODE` — production: proxy the JS API through `/api/amap-proxy` so the secret stays server-side
- `NEON_AUTH_BASE_URL` — Neon Auth base URL (`https://…neon.tech/…/auth`); unset to disable 收藏/登录
- `NEON_AUTH_COOKIE_SECRET` — ≥32 chars; signs the session cookie cache (generate once: `openssl rand -base64 38`)
- `NEXT_PUBLIC_AUTH_URL` — same as `NEON_AUTH_BASE_URL` (public, used by the browser client)

Open http://localhost:3000 to create a route.

## Commands

```bash
pnpm install        # bootstrap all workspaces

pnpm dev            # web development server (apps/web)
pnpm build          # web production build
pnpm lint           # ESLint (web)
pnpm typecheck      # tsc --noEmit across all packages
pnpm test           # Vitest unit tests across all packages
pnpm e2e            # Playwright E2E tests (web)
pnpm db:migrate     # apply committed migrations (apps/web)
pnpm db:generate    # generate a migration from schema changes

# Mobile (apps/mobile)
pnpm --filter @roam/mobile start          # expo dev server (use a dev build, not Expo Go)
pnpm --filter @roam/mobile ios            # run on iOS simulator/device
pnpm --filter @roam/mobile android        # run on Android emulator/device
# Release builds via EAS: eas build --profile preview / production (see apps/mobile/eas.json)
```

## Mobile App (apps/mobile)

Offline-first iOS/Android client sharing `@roam/core` with the web app:

- **Local-first storage**: trips live in on-device SQLite; every edit persists instantly and syncs in the background
- **Sync engine**: push (idempotent `PUT /api/trips/[id]` upsert with optimistic concurrency) → pull (`GET /api/recent?since=` delta incl. delete tombstones); exponential backoff offline; retriggers on foreground / network recovery
- **Conflicts**: trip-level "keep mine / take cloud" resolution; force-push supported server-side
- **Identity**: anonymous device token (SecureStore) on first launch; optional account pairing — generate a 6-digit code in Settings, enter it at `/pair` on the logged-in website; device data is claimed into the account (shared with web)
- **Map**: native AMap SDK via `react-native-amap3d` behind a thin rendering layer (`src/map/`), colors/gesture semantics matching the web editor

Known gaps vs web (tracked in design doc §7.1 phase 2): freehand drawing and vertex snapping need a continuous touch-stream + projection bridge that amap3d does not expose — requires a small custom Expo native module (or an amap3d fork) verified on real devices.

### Mobile env vars (`apps/mobile/.env.local`, see `.env.example`)

- `EXPO_PUBLIC_API_BASE_URL` — web service base URL (LAN IP for device debugging)
- `AMAP_ANDROID_KEY` / `AMAP_IOS_KEY` — native SDK keys (bound to package name + SHA1 / bundle ID)

## Project Structure

```
packages/
├─ core/                         # shared domain layer (zero React/DOM/RN deps)
│  └─ src/{types.ts, trip/{ops,geo,validation}.ts}
└─ api-client/                   # typed API client shared by web & mobile
apps/
├─ web/
│  └─ src/
│     ├─ app/
│     │  ├─ page.tsx             home (create / recent routes, nickname)
│     │  ├─ editor/[tripId]/     editor page
│     │  ├─ t/[shareId]/         share page
│     │  ├─ pair/                device pairing confirm page
│     │  └─ api/                 backend endpoints (trips + PUT upsert / route / search / regeocode / weather / claim / nickname / recent?since= / auth/device-token|device-pair / amap-proxy)
│     ├─ components/             editor UI, share page, weather, ui primitives
│     ├─ hooks/                  client hooks
│     └─ lib/
│        ├─ db/                  repositories (Neon / memory fallback), schema, repo interface
│        ├─ routing/             routing provider abstraction + AMap adapter + cache
│        ├─ useTripStore.ts      zustand editor store (undo/redo, save loop, route queue)
│        ├─ lbs.ts               AMap Web Service helpers (regeocode, weather) with cache
│        └─ auth.ts              identity resolution: session → Bearer device token → anonymous cookie
└─ mobile/
   ├─ app/                       expo-router screens (home / editor / share / settings)
   ├─ plugins/with-amap.js       config plugin injecting native AMap keys
   └─ src/
      ├─ map/                    TripMap rendering layer over react-native-amap3d (+ adapter interface)
      ├─ store/                  zustand stores (trip store ported from web; sync state)
      ├─ services/               SQLite local db, session/device identity, sync engine, triggers
      └─ features/editor/        search panel, day edit modal, segment mode bar
```

Design docs: `docs/superpowers/specs/` — see `2026-08-23-mobile-app-monorepo-design.md` for the mobile architecture.