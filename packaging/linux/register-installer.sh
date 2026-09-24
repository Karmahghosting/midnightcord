#!/bin/sh
set -eu

script_path=$(readlink -f -- "$0")
script_dir=$(dirname -- "$script_path")
exec env ELECTRON_RUN_AS_NODE=1 "$script_dir/midnightcord-installer" "$script_dir/register-installer.mjs" "$@"
