# Checks for services.riptide-agent on one Linux system.
# agent-vm boots a NixOS VM, so it needs KVM and is defined for x86_64-linux only.
{ self, nixpkgs, pkgs }:
let
  inherit (nixpkgs) lib;
  inherit (pkgs.stdenv.hostPlatform) system;

  # Smallest NixOS config that passes every assertion, with the agent enabled.
  evalHost = extra: lib.nixosSystem {
    modules = [
      self.nixosModules.agent
      {
        nixpkgs.hostPlatform = system;
        boot.loader.grub.enable = false;
        fileSystems."/" = { device = "none"; fsType = "tmpfs"; };
        system.stateVersion = "25.11";
        networking.hostName = "eval";
        services.riptide-agent = {
          enable = true;
          convexUrl = "https://example.convex.cloud";
        };
      }
      extra
    ];
  };

  plain = (evalHost { }).config;
  nvidia = (evalHost {
    nixpkgs.config.allowUnfree = true;
    services.xserver.videoDrivers = [ "nvidia" ];
    hardware.nvidia.open = false;
  }).config.systemd.services.riptide-agent;
  failed = lib.filter (a: !a.assertion) plain.assertions;
in
{
  # Builds only the unit file, after forcing every assertion of the config.
  # The NVIDIA variant is checked at eval time only, so the driver is never built.
  agent-module-eval =
    assert lib.assertMsg (failed == [ ]) (lib.concatMapStringsSep "\n" (a: a.message) failed);
    assert lib.assertMsg
      (lib.hasInfix "nvidia" nvidia.environment.PATH && !nvidia.serviceConfig.PrivateDevices)
      "On NVIDIA hosts nvidia-smi must be on PATH and /dev/nvidia* reachable.";
    plain.systemd.units."riptide-agent.service".unit;
}
// lib.optionalAttrs (system == "x86_64-linux") {
  # No GPU, no fans and no network in the VM. The stdout gateway prints each
  # report as one JSON line, which lands in the journal.
  agent-vm = pkgs.testers.runNixOSTest {
    name = "riptide-agent";
    nodes.machine = {
      imports = [ self.nixosModules.agent ];
      services.riptide-agent = {
        enable = true;
        convexUrl = "http://127.0.0.1:1";
      };
      systemd.services.riptide-agent.environment.RIPTIDE_GATEWAY = "stdout";
      environment.etc."riptide/token" = {
        text = "vm-test-token";
        mode = "0400";
      };
    };
    testScript = ''
      import json

      machine.wait_for_unit("riptide-agent.service")
      # Process substitution, so grep -q exiting early cannot fail the pipe under pipefail.
      machine.wait_until_succeeds("grep -q '\"sample\"' <(journalctl -u riptide-agent -o cat)", timeout=90)
      lines = machine.succeed("journalctl -u riptide-agent -o cat").splitlines()
      report = json.loads(next(line for line in lines if '"sample"' in line))
      assert report["host"] == "machine", report
      machine.succeed("systemctl is-active riptide-agent")
      restarts = machine.succeed("systemctl show -p NRestarts --value riptide-agent").strip()
      assert restarts == "0", f"agent restarted {restarts} times"
    '';
  };
}
