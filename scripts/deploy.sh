#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${APP_PORT}/health"
MAX_ATTEMPTS=12
SLEEP_SECONDS=3

echo "==> Pulling latest WorkVault image"
docker compose pull workvault

echo "==> Recreating WorkVault container"
docker compose up -d --remove-orphans workvault

echo "==> Cleaning up old images"
docker image prune -f

echo "==> Current containers"
docker compose ps

echo "==> Waiting for health endpoint: ${HEALTH_URL}"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if curl --fail --silent --show-error "$HEALTH_URL"; then
    echo
    echo "==> Deployment completed successfully"
    exit 0
  fi

  echo "Attempt ${attempt}/${MAX_ATTEMPTS}: application is not ready yet"
  sleep "$SLEEP_SECONDS"
done

echo "==> Deployment failed: health endpoint did not respond"
echo "==> Recent application logs:"
docker compose logs --tail=100

exit 1