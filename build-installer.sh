#!/bin/sh
# Package on the target OS; pass --x64, --arm64, --dir or --appimage as needed.
set -eu
if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required. Install the root dependencies and build the client first." >&2
    exit 1
fi
INSTALLER_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$INSTALLER_ROOT/scripts/packageInstaller.mjs" "$@"
