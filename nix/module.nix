# services.riptide-agent: runs the compiled agent as a hardened systemd unit.
# Takes this flake's `self` so `package` can default to its own build.
self:
{ config, lib, pkgs, ... }:
let
  cfg = config.services.riptide-agent;
  nvidia = config.hardware.nvidia.enabled;
in
{
  options.services.riptide-agent = {
    enable = lib.mkEnableOption "the riptide metrics agent";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.agent;
      defaultText = lib.literalExpression "riptide.packages.\${pkgs.stdenv.hostPlatform.system}.agent";
      description = "The riptide-agent package to run.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = config.networking.hostName;
      defaultText = lib.literalExpression "config.networking.hostName";
      description = "Host name the agent reports under.";
    };

    convexUrl = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "https://example-123.convex.cloud";
      description = "URL of the Convex deployment the agent reports to.";
    };

    tokenFile = lib.mkOption {
      # A string, not a path, so a token never gets copied into the store.
      type = lib.types.str;
      default = "/etc/riptide/token";
      description = ''
        File holding the agent token, readable by root. systemd passes it to
        the unit as the `token` credential, so the service user never reads it directly.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.convexUrl != null && builtins.match "https?://.+" cfg.convexUrl != null;
        message = "services.riptide-agent.convexUrl must be set to the Convex deployment URL (http:// or https://).";
      }
      {
        assertion = lib.hasPrefix "/" cfg.tokenFile;
        message = "services.riptide-agent.tokenFile must be an absolute path, got `${cfg.tokenFile}`.";
      }
      {
        assertion = cfg.host != "";
        message = "services.riptide-agent.host is empty. Set it, or set networking.hostName.";
      }
    ];

    systemd.services.riptide-agent = {
      description = "riptide metrics agent";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" ];
      # The agent probes PATH for nvidia-smi to decide whether to report GPUs.
      path = lib.optional nvidia config.hardware.nvidia.package.bin;
      environment = {
        CONVEX_URL = cfg.convexUrl;
        RIPTIDE_HOST = cfg.host;
      };

      serviceConfig = {
        ExecStart = lib.getExe cfg.package;
        DynamicUser = true;
        LoadCredential = "token:${cfg.tokenFile}";
        Restart = "always";
        RestartSec = "5s";
        # The Effect runtime exits 130 when interrupted by SIGTERM; a stop is not a failure.
        SuccessExitStatus = "130";
        UMask = "0077";

        CapabilityBoundingSet = "";
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        # `true` overmounts /home with an empty tmpfs-backed dir, so /proc/mounts
        # shows tmpfs there and the /home disk drops out of the report.
        # `read-only` keeps the real mount, at the cost of the agent being
        # able to read world-readable files under /home.
        ProtectHome = "read-only";
        PrivateTmp = true;
        # /dev/nvidia* must stay visible for nvidia-smi. ProtectClock adds a
        # DeviceAllow rule, which turns on a device allowlist that blocks them.
        PrivateDevices = !nvidia;
        ProtectClock = !nvidia;
        ProtectHostname = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        # Hides other users' processes only. ProcSubset=pid would hide
        # /proc/stat, /proc/meminfo and friends, which the agent reads.
        ProtectProc = "invisible";
        # AF_UNIX for glibc's nscd lookups during DNS resolution.
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        LockPersonality = true;
        SystemCallArchitectures = "native";
        # MemoryDenyWriteExecute stays off: Bun's JavaScriptCore JIT maps
        # writable and executable memory, which it would kill.
      };
    };
  };
}
