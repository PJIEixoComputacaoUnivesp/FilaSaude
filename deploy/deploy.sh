#!/usr/bin/env sh

set -eu

new_tag=${1:-}
app_dir=${APP_DIR:-/opt/filasaude}
state_file="$app_dir/.last-successful-tag"

if ! printf '%s' "$new_tag" | grep -Eq '^sha-[0-9a-f]{40}$'; then
  echo "Invalid image tag: $new_tag" >&2
  exit 1
fi

cd "$app_dir"

previous_tag=""
if [ -f "$state_file" ]; then
  previous_tag=$(cat "$state_file")
fi

export IMAGE_TAG="$new_tag"

docker compose --env-file .env -f compose.prod.yaml pull

if docker compose --env-file .env -f compose.prod.yaml up \
  --detach \
  --remove-orphans \
  --wait \
  --wait-timeout 120; then
  printf '%s\n' "$new_tag" > "$state_file"
  docker image prune --force
  exit 0
fi

echo "Deployment failed." >&2

if [ -n "$previous_tag" ]; then
  echo "Rolling back to $previous_tag." >&2
  export IMAGE_TAG="$previous_tag"
  docker compose --env-file .env -f compose.prod.yaml up \
    --detach \
    --remove-orphans \
    --wait \
    --wait-timeout 120
fi

exit 1
