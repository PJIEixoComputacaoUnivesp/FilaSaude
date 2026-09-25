#!/usr/bin/env sh

# Dumps the production database to $BACKUP_DIR and keeps the newest $KEEP files.
# Usage: backup.sh

set -eu

app_dir=${APP_DIR:-/opt/filasaude}
backup_dir=${BACKUP_DIR:-$app_dir/backups}
keep=${KEEP:-7}

cd "$app_dir"
umask 077
mkdir -p "$backup_dir"

target="$backup_dir/filasaude-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
partial="$target.partial"

# pg_dump runs inside the container, so no database port is exposed. It
# compresses the output itself, so its exit status is not hidden by a pipe.
if ! docker compose --env-file .env -f compose.prod.yaml exec -T postgres \
  sh -c 'pg_dump --clean --if-exists --no-owner --compress=gzip:6 -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$partial"; then
  rm -f "$partial"
  echo "Backup failed." >&2
  exit 1
fi

mv "$partial" "$target"
echo "Backup written to $target"

# File names sort chronologically; remove everything but the newest $keep.
find "$backup_dir" -maxdepth 1 -name 'filasaude-*.sql.gz' | sort -r |
  tail -n +"$((keep + 1))" |
  while IFS= read -r old_backup; do
    rm -f "$old_backup"
  done
