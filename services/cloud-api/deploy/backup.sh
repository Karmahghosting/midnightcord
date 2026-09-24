#!/bin/sh
set -eu

umask 077
data_dir="${DATA_DIR:-/var/lib/midnightcord-cloud}"
backup_dir="${BACKUP_DIR:-/var/backups/midnightcord-cloud}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/midnightcord-cloud-$stamp.tar.gz"
temporary="$backup_dir/.$stamp.tar.gz.tmp"

mkdir -p "$data_dir/accounts" "$backup_dir"
tar -C "$data_dir" -czf "$temporary" accounts
mv "$temporary" "$archive"
find "$backup_dir" -type f -name 'midnightcord-cloud-*.tar.gz' -mtime +13 -delete
