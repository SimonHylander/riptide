{
  description = "riptide: real-time host monitoring";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # Add `packages = forAllSystems (pkgs: { agent = ...; });` here (bun2nix).

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          # Confect's CLI requires Node >= 24.
          packages = [ pkgs.bun pkgs.nodejs_24 ];
        };
      });
    };
}
