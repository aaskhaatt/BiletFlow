#!/bin/sh
# Backs up a BiletFlow database to one file (SRS 7: regular backups and recovery).
#
#   DATABASE_URL=postgresql://user:pass@host:5432/biletflow ./scripts/backup_db.sh [output_dir]
#
# Uses pg_dump from the official postgres:16 image, so only Docker is needed. The file is in pg_dump's
# "custom" format: compressed, and restorable with scripts/restore_db.sh. It holds emails and password hashes:
# keep it private, never commit it (backups/ is in .gitignore).
set -eu

: "${DATABASE_URL:?set DATABASE_URL to the database to back up}"
# the app's URL may name a driver ("postgresql+psycopg2://"); pg_dump only understands plain "postgresql://"
DB_URL=$(printf '%s' "$DATABASE_URL" | sed 's#^postgresql+[a-z0-9]*://#postgresql://#')
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/biletflow-$(date -u +%Y%m%d-%H%M%S).dump"

# --network host: a database on this machine (localhost) is reachable from the container too
docker run --rm --network host postgres:16 \
  pg_dump --format=custom --no-owner --no-privileges "$DB_URL" > "$FILE"

echo "backup written: $FILE ($(du -h "$FILE" | cut -f1))"
