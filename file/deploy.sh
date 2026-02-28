#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/file/docker-compose.yml"

cmd="${1:-up}"

case "$cmd" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d --build
    echo "Open: http://127.0.0.1:9003/compress/movie_compress.html"
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" up -d --build
    echo "Open: http://127.0.0.1:9003/compress/movie_compress.html"
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=200
    ;;
  ps|status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    echo "Usage: $0 {up|down|restart|logs|ps|status}"
    exit 1
    ;;
esac
