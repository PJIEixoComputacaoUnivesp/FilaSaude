#!/usr/bin/env sh

# Usage:
#   deploy.sh deploy <tag>   start <tag>; roll back if the Compose health checks fail
#   deploy.sh confirm <tag>  record <tag> as the last successful release
#   deploy.sh rollback       reapply the last successful release

set -eu

command=${1:-}
tag=${2:-}
app_dir=${APP_DIR:-/opt/filasaude}
state_file="$app_dir/.last-successful-tag"

validate_tag() {
  if ! printf '%s' "$1" | grep -Eq '^sha-[0-9a-f]{40}$'; then
    echo "Invalid image tag: $1" >&2
    exit 1
  fi
}

compose_up() {
  IMAGE_TAG="$1" docker compose --env-file .env -f compose.prod.yaml up \
    --detach \
    --remove-orphans \
    --wait \
    --wait-timeout 120
}

rollback() {
  previous_tag=""
  if [ -f "$state_file" ]; then
    previous_tag=$(cat "$state_file")
  fi

  if [ -z "$previous_tag" ]; then
    echo "No previous successful release to roll back to." >&2
    exit 1
  fi

  echo "Rolling back to $previous_tag." >&2
  compose_up "$previous_tag"
}

cd "$app_dir"

case "$command" in
  deploy)
    validate_tag "$tag"
    IMAGE_TAG="$tag" docker compose --env-file .env -f compose.prod.yaml pull

    if compose_up "$tag"; then
      exit 0
    fi

    echo "Deployment failed." >&2
    rollback
    exit 1
    ;;
  confirm)
    validate_tag "$tag"
    printf '%s\n' "$tag" > "$state_file"
    docker image prune --force
    ;;
  rollback)
    rollback
    ;;
  *)
    echo "Usage: $0 deploy <tag> | confirm <tag> | rollback" >&2
    exit 1
    ;;
esac
