/// <reference types="vite/client" />

// Server-only WORKOS_* variables are read by AuthKit from process.env at request time,
// never from import.meta.env. See .env.example.

interface ImportMetaEnv {
  /** Convex deployment URL. Defaults to CONVEX_URL from packages/backend/.env.local. */
  readonly VITE_CONVEX_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
