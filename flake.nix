{
  description = "riptide: real-time host monitoring";

  # Prebuilt bun2nix from the nix-community cache.
  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    bun2nix = {
      url = "github:nix-community/bun2nix?ref=2.1.2";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, bun2nix }:
    let
      inherit (nixpkgs) lib;
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        lib.genAttrs systems (system:
          f (import nixpkgs {
            inherit system;
            overlays = [ bun2nix.overlays.default ];
          }));
    in
    {
      packages = forAllSystems (pkgs: {
        # Compiled Bun binary at $out/bin/riptide-agent.
        agent = pkgs.bun2nix.mkDerivation {
          pname = "riptide-agent";
          version = "0.0.0";
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./bun.lock
              ./bun.nix
              ./tsconfig.base.json
              ./apps/agent
              # Workspace manifest only, so bun.lock still matches.
              ./apps/web/package.json
              ./packages/domain
              ./packages/backend
            ];
          };
          bunDeps = pkgs.bun2nix.fetchBunDeps { bunNix = ./bun.nix; };
          module = "apps/agent/src/main.ts";
          # Bytecode defaults to CJS, which rejects the `import.meta` in
          # effect's ConfigProvider. ESM bytecode works with nixpkgs bun.
          extraBunBuildFlags = [ "--format=esm" ];
          # The only lifecycle script is our `bun2nix` postinstall.
          dontRunLifecycleScripts = true;
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          # Confect's CLI requires Node >= 24.
          packages = [ pkgs.bun pkgs.nodejs_24 ];
        };
      });
    };
}
