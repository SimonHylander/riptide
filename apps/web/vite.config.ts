import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, loadEnv } from "vite"

const backendDir = resolve(import.meta.dirname, "../../packages/backend")

export default defineConfig(({ mode }) => {
  // `convex dev` writes CONVEX_URL to packages/backend/.env.local. Use it as the
  // default for VITE_CONVEX_URL so local dev needs no extra setup. An explicit
  // VITE_CONVEX_URL (shell, apps/web/.env.local, Vercel) takes precedence.
  const webEnv = loadEnv(mode, import.meta.dirname, "VITE_")
  const backendEnv = loadEnv(mode, backendDir, "CONVEX_")
  const convexUrl = webEnv.VITE_CONVEX_URL ?? backendEnv.CONVEX_URL

  return {
    // WORKOS_REDIRECT_URI points at :3000. strictPort fails fast instead of silently
    // moving to :3001, where the callback would redirect to the wrong port.
    server: { port: 3000, strictPort: true },
    resolve: { tsconfigPaths: true },
    define: convexUrl
      ? { "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl) }
      : {},
    plugins: [
      tailwindcss(),
      tanstackStart(),
      nitro(),
      viteReact(),
    ],
  }
})
