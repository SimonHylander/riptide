import { configDefaults, defineProject } from "vitest/config"

export default defineProject({
  test: {
    // Confect `*.spec.ts` files are function specs, not tests.
    exclude: ["**/*.spec.ts", "**/node_modules/**"],
    name: "backend",
    // Confect group specs are named `*.spec.ts` but are not tests.
    exclude: [...configDefaults.exclude, "confect/**/*.spec.ts"],
    // convex-test must be bundled by vite so `import.meta.glob` modules resolve.
    server: { deps: { inline: ["convex-test"] } },
  },
})
