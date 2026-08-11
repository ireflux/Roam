# Roam Route Planner

A travel route planning tool with deep route-editing capabilities: automatic route generation, freehand drawing, road-snapping adjustments, multi-day itineraries, and short-link sharing.

## Features

- **Place search & map click**: AMap POI search or click directly on the map; places added by clicking are named automatically via reverse geocoding
- **Automatic route planning**: real road routes between adjacent places, with per-segment travel modes — driving / walking / cycling / transit (bus & metro, with walking transfer segments rendered separately)
- **Smart mode suggestion**: mode auto-suggested by distance (walking <1.5 km, cycling 1.5–8 km, driving >8 km)
- **Freehand drawing**: hold and drag to draw a line; endpoints snap to nearby places (<100 m) or create new ones
- **Vertex snapping**: select a segment and drag its vertices to reshape it; the segment is then marked as manually edited
- **Multi-day itineraries**: organize places by day, drag to reorder, rename days, move places between days, per-place notes
- **Undo/redo** (Ctrl+Z) and debounced auto-save
- **Resilience**: failed route planning degrades to a straight line with a retry badge; per-segment status tracking
- **Sharing**: read-only short-link page with per-day place cards, live weather per day, and full-route animated playback

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4
- AMap (高德) JS API 2.0 for the map
- AMap Web Service API for POI search, route planning, reverse geocoding, and live weather
- Neon Postgres + Drizzle ORM; falls back to in-memory storage when `DATABASE_URL` is unset (non-production)
- Zustand for client state; Vitest + Testing Library for unit tests; Playwright for E2E

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
cp .env.example .env.local   # fill in Neon and AMap variables
npm install
npm run db:migrate           # apply committed migrations
npm run dev
```

Environment variables:

- `DATABASE_URL` — Neon Postgres connection string (optional locally; without it the app uses in-memory storage)
- `AMAP_WEB_SERVICE_KEY` — AMap Web Service API key (server-only)
- `NEXT_PUBLIC_AMAP_JS_API_KEY` — AMap JS API key (public; restrict to your domain in the AMap console)
- `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` — JS API security secret (development only, plaintext)
- `NEXT_PUBLIC_AMAP_PROXY=true` + `AMAP_SECURITY_JS_CODE` — production: proxy the JS API through `/api/amap-proxy` so the secret stays server-side

Open http://localhost:3000 to create a route.

## Commands

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # run the production build
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit tests
npm run test:watch  # Vitest watch mode
npm run e2e         # Playwright E2E tests
npm run db:push     # local prototyping only: sync schema
npm run db:migrate  # apply committed migrations (Preview / Production)
npm run db:generate # generate a migration from schema changes
```

## Project Structure

```
src/
├─ app/
│  ├─ page.tsx                  home (create / recent routes, nickname)
│  ├─ editor/[tripId]/          editor page
│  ├─ t/[shareId]/              share page
│  └─ api/                      backend endpoints (trips / route / search / regeocode / weather / claim / nickname / recent / amap-proxy)
├─ components/
│  ├─ editor/                   editor UI (MapLayers, SearchBox, freehand drawing, vertex snapping, sidebar/drawer)
│  ├─ share/                    share page (map layers, card stream, animation)
│  ├─ weather/                  per-day live weather
│  └─ ui/                       shared UI primitives
├─ hooks/                       client hooks (onboarding, drawer, touch reorder, …)
└─ lib/
   ├─ trip/                     pure-function core (immutable ops, geometry, validation)
   ├─ routing/                  routing provider abstraction + AMap adapter + cache
   ├─ db/                       data repositories (Neon / in-memory fallback)
   ├─ useTripStore.ts           zustand editor store (undo/redo, save loop, route queue)
   ├─ lbs.ts                    AMap Web Service helpers (regeocode, weather) with cache
   ├─ auth.ts                   anonymous owner cookie
   └─ types.ts                  shared domain types
```

Design doc: `docs/superpowers/specs/2026-08-03-route-planner-design.md` (historical — map/search/route capabilities have since migrated to AMap; this README reflects the current implementation)