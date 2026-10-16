#!/usr/bin/env sh

# Runs the CNES catalog ingestion with the last successfully deployed image.
# Optional arguments are forwarded to the command, for example: --state SP.

set -eu

app_dir=${APP_DIR:-/opt/filasaude}
state_file="$app_dir/.last-successful-tag"
lock_file="$app_dir/.ingest-units.lock"

cd "$app_dir"
if [ ! -s "$state_file" ]; then
  echo "No successful release is available for ingestion." >&2
  exit 1
fi
tag=$(sed -n '1p' "$state_file")
if ! printf '%s' "$tag" | grep -Eq '^sha-[0-9a-f]{40}$'; then
  echo "Invalid image tag in $state_file." >&2
  exit 1
fi

exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Another unit ingestion is already running." >&2
  exit 1
fi

IMAGE_TAG="$tag" docker compose --env-file .env -f compose.prod.yaml run \
  --rm --no-deps api \
  node apps/api/dist/ingest-units.js "$@"
