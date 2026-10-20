/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex deployment URL. Defaults to CONVEX_URL from packages/backend/.env.local. */
  readonly VITE_CONVEX_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
