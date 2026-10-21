import { defineConfig } from "vitest/config"

// One vitest project per workspace. Workspaces without tests pass.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ["apps/*", "packages/*"],
  },
})
