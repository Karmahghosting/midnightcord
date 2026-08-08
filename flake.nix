{
  description = "Midnightcord development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    nixpkgs-node16.url = "github:NixOS/nixpkgs/nixos-22.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, nixpkgs-node16, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        pkgsNode16 = import nixpkgs-node16 {
          inherit system;
          config.allowUnfree = true;
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgsNode16.nodejs-16_x
            pkgs.pnpm
            pkgs.git
            pkgs.curl
            pkgs.zip
            pkgs.unzip
            pkgs.jq
            pkgs.powershell
          ];

          shellHook = ''
            export npm_config_update_notifier=false
            export ELECTRON_SKIP_BINARY_DOWNLOAD=1
            echo "Midnightcord dev shell active (Node $(node -v))"
          '';
        };
      });
}
