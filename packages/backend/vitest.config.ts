import { configDefaults, defineProject } from "vitest/config"

export default defineProject({
  test: {
    name: "backend",
    // Confect group specs are named `*.spec.ts` but are not tests.
    exclude: [...configDefaults.exclude, "confect/**/*.spec.ts"],
    // convex-test must be bundled by vite so `import.meta.glob` modules resolve.
    server: { deps: { inline: ["convex-test"] } },
  },
})
