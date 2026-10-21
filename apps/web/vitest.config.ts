import viteReact from "@vitejs/plugin-react"
import { defineProject } from "vitest/config"

export default defineProject({
  plugins: [viteReact()],
  resolve: { tsconfigPaths: true },
  test: {
    name: "web",
    environment: "jsdom",
  },
})
