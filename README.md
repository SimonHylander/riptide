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

## Running the agent

The flake exposes `packages.<system>.agent` (`x86_64-linux`, `aarch64-linux`, plus `aarch64-darwin` for local builds) and `nixosModules.agent`. The binary is `bin/riptide-agent` and reads its config from env:

| Variable                 | What                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `CONVEX_URL`             | Convex deployment URL, required                                            |
| `RIPTIDE_HOST`           | Name to report under, defaults to the machine hostname                     |
| token                    | `$CREDENTIALS_DIRECTORY/token` (systemd `LoadCredential=`), else `RIPTIDE_AGENT_TOKEN` |
| `RIPTIDE_GATEWAY`        | `convex` (default) or `stdout`, which prints one JSON line per report      |

### Binary cache

`nixConfig` in `flake.nix` adds the nix-community cache for bun2nix. Nix honours `nixConfig` only for the flake you build directly, so a flake that imports riptide must add the cache to its own NixOS config:

```nix
nix.settings = {
  extra-substituters = [ "https://nix-community.cachix.org" ];
  extra-trusted-public-keys = [ "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs=" ];
};
```

### NixOS

```nix
{
  inputs.riptide.url = "git+ssh://git@github.com/SimonHylander/riptide";

  outputs = { nixpkgs, riptide, ... }: {
    nixosConfigurations.<host> = nixpkgs.lib.nixosSystem {
      modules = [
        riptide.nixosModules.agent
        {
          services.riptide-agent = {
            enable = true;
            convexUrl = "https://<deployment>.convex.cloud";
          };
        }
      ];
    };
  };
}
```

| Option      | Default                                  | What                                  |
| ----------- | ---------------------------------------- | ------------------------------------- |
| `enable`    | `false`                                  | Run the agent                         |
| `package`   | this flake's `agent` for the host system | Agent package                         |
| `host`      | `config.networking.hostName`             | Name to report under                  |
| `convexUrl` | none, required                           | Convex deployment URL                 |
| `tokenFile` | `/etc/riptide/token`                     | Token file, owned by root, mode 0400  |

The token never enters the Nix store. Put it on the host yourself (see below) or point `tokenFile` at a secret from agenix or sops-nix. On hosts with NVIDIA drivers (`hardware.nvidia.enabled`), the module puts `nvidia-smi` on the unit's `PATH` and leaves `/dev/nvidia*` reachable.

### Other Linux hosts

Get the binary with Nix on the host. The compiled binary links against glibc in the Nix store, so it needs its closure, not just the file. Build as your user, because sudo drops `SSH_AUTH_SOCK` and the fetch from this private repo fails. sudo only registers the result as a GC root at `/opt/riptide-agent`.

```sh
nix build 'git+ssh://git@github.com/SimonHylander/riptide#agent' --out-link ./riptide-agent
sudo nix-store --add-root /opt/riptide-agent --realise "$(readlink -f ./riptide-agent)"
# or build on another Linux machine of the same arch and copy the closure:
#   nix build .#agent && nix copy --to ssh://root@<host> ./result
#   then on the host: sudo nix-store --add-root /opt/riptide-agent --realise <store path>
```

Store the token, readable by root only. systemd hands it to the service as a credential:

```sh
sudo install -d -m 0755 /etc/riptide
printf '%s' "$AGENT_TOKEN" | sudo install -m 0400 -o root -g root /dev/stdin /etc/riptide/token
```

`/etc/systemd/system/riptide-agent.service`, the same hardening as the NixOS module:

```ini
[Unit]
Description=riptide metrics agent
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=/opt/riptide-agent/bin/riptide-agent
Environment=CONVEX_URL=https://<deployment>.convex.cloud
# Environment=RIPTIDE_HOST=<name>   defaults to the hostname
DynamicUser=true
LoadCredential=token:/etc/riptide/token
Restart=always
RestartSec=5s
SuccessExitStatus=130
UMask=0077

CapabilityBoundingSet=
NoNewPrivileges=true
ProtectSystem=strict
# ProtectHome=true hides the /home mount, so its disk would drop out of the report.
ProtectHome=read-only
PrivateTmp=true
# With NVIDIA: set both to false, so nvidia-smi can open /dev/nvidia*.
PrivateDevices=true
ProtectClock=true
ProtectHostname=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
# Not ProcSubset=pid: the agent reads /proc/stat, /proc/meminfo and others.
ProtectProc=invisible
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
SystemCallArchitectures=native
# No MemoryDenyWriteExecute: Bun's JIT needs writable and executable memory.

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now riptide-agent
journalctl -u riptide-agent -f
```

The agent finds `nvidia-smi` on systemd's default `PATH` (`/usr/bin` on most distros).

### Checks

`nix flake check` evaluates the module on both Linux systems. `checks.x86_64-linux.agent-vm` boots a NixOS VM with the service enabled and the `stdout` gateway, and waits for a report in the journal. It needs KVM, so it runs in CI (`nix build .#checks.x86_64-linux.agent-vm -L`).
