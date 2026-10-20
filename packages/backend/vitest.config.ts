import { defineProject } from "vitest/config"

export default defineProject({
  test: {
    name: "backend",
    // convex-test must be bundled by vite so `import.meta.glob` modules resolve.
    server: { deps: { inline: ["convex-test"] } },
  },
})
