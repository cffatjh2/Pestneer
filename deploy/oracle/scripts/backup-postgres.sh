#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(dirname "$SCRIPT_DIR")
BACKUP_DIR="$DEPLOY_DIR/backups"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_DIR"

docker compose exec -T postgres sh -c \
  'pg_dump --format=custom --compress=9 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "$BACKUP_DIR/pestneer-$TIMESTAMP.dump"

find "$BACKUP_DIR" -type f -name 'pestneer-*.dump' -mtime +7 -delete
