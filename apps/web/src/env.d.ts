/// <reference types="vite/client" />

// Server-only WORKOS_* variables are read by AuthKit from process.env at request time,
// never from import.meta.env. See .env.example.

interface ImportMetaEnv {
  /** Convex deployment URL. Defaults to CONVEX_URL from packages/backend/.env.local. Not needed for the fixture feed. */
  readonly VITE_CONVEX_URL?: string
  /** MetricsFeed adapter, see `src/feed/selectFeed.ts`. `convex` (default) or `fixture`. */
  readonly VITE_FEED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
