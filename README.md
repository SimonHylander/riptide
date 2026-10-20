<img src="assets/icon.svg" width="64" height="64" alt="">

# riptide

Real-time host monitoring. An agent on each host samples metrics every second and writes them to Convex. A dashboard shows them live.

Created in [T3 Code](https://t3.codes).

## Layout

Bun workspaces.

| Package             | Path               | What                                                            |
| ------------------- | ------------------ | --------------------------------------------------------------- |
| `@riptide/web`      | `apps/web`         | TanStack Start dashboard (Nitro, deployable to Vercel)          |
| `@riptide/agent`    | `apps/agent`       | Bun + Effect metrics agent, runs on any Linux host              |
| `@riptide/backend`  | `packages/backend` | Convex functions written with Confect (`confect/` and `convex/`) |
| `@riptide/domain`   | `packages/domain`  | Pure Effect Schema types and rules, depends only on `effect`    |

## Setup

Requires [Bun](https://bun.sh) and Node 24+ (Confect's CLI). `nix develop` provides both.

```sh
bun install
cd packages/backend && bunx convex dev --once   # first run: log in and link or create the Convex project
bun run dev                                     # web on :3000 (next free port if taken) plus Convex and Confect watchers
```

`convex dev` writes `packages/backend/.env.local` (gitignored). `apps/web` reads `CONVEX_URL` from that file as `VITE_CONVEX_URL`. To use another deployment, set `VITE_CONVEX_URL` in the shell, in `apps/web/.env.local`, or in the Vercel project.

## Scripts

| Script              | What                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `bun run dev`       | Web dev server plus `convex dev` and `confect dev`                |
| `bun run typecheck` | `tsc --noEmit` in every workspace                                 |
| `bun run test`      | Vitest across all workspaces (`test.projects` in `vitest.config.ts`) |

After changing `packages/backend/confect/`, run `bun run --filter @riptide/backend codegen` (or keep `bun run dev` running) and commit `confect/_generated`.
