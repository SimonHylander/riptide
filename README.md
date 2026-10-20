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
(cd packages/backend && bunx convex dev --once) # first run: log in and link or create the Convex project
bun run dev                                     # web on :3000 (next free port if taken) plus Convex and Confect watchers
```

`convex dev` writes `packages/backend/.env.local` (gitignored). `apps/web` reads `CONVEX_URL` from that file as `VITE_CONVEX_URL`. To use another deployment, set `VITE_CONVEX_URL` in the shell, in `apps/web/.env.local`, or in the Vercel project.

## Auth

The dashboard signs in with WorkOS AuthKit. Every page except `/sign-in` and `/callback` requires a session, and Convex only serves data to `ALLOWED_USER_ID`. Other WorkOS users see a "Not authorized" page.

WorkOS dashboard, per environment:

1. Create the AuthKit application and turn **sign-up off** (Authentication settings). The app has no sign-up route, so sign-up only exists if it is enabled here.
2. **Redirects:** Redirect URI `http://localhost:3000/callback`, Initiate login URI `http://localhost:3000/sign-in`, Sign-out redirect `http://localhost:3000/`. Add the production URLs when deploying.
3. **Users:** invite Simon, accept the invite and sign in once. Copy the user ID (`user_...`).

Web: copy `apps/web/.env.example` to `apps/web/.env.local` and fill in `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI` and `WORKOS_COOKIE_PASSWORD` (`openssl rand -base64 24`). They are server-only and read at request time. On Vercel, set them as project env vars.

The dev server always runs on port 3000 to match the Redirect URI. If the port is taken, `vite dev` exits instead of picking another port.

Convex: `convex/auth.config.ts` (generated from `confect/auth.ts`) trusts WorkOS tokens for `WORKOS_CLIENT_ID`. Every Convex deployment needs `WORKOS_CLIENT_ID` set before its first push, otherwise the push fails. A placeholder such as `client_unconfigured` works until WorkOS is set up, and sign-in fails until it is replaced. Set both values on the deployment:

```sh
cd packages/backend
bunx convex env set WORKOS_CLIENT_ID client_...
bunx convex env set ALLOWED_USER_ID user_...
```

## Scripts

| Script              | What                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `bun run dev`       | Web dev server plus `convex dev` and `confect dev`                |
| `bun run typecheck` | `tsc --noEmit` in every workspace                                 |
| `bun run test`      | Vitest across all workspaces (`test.projects` in `vitest.config.ts`) |

After changing `packages/backend/confect/`, run `bun run --filter @riptide/backend codegen` (or keep `bun run dev` running) and commit `confect/_generated`.
