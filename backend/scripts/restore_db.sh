#!/bin/sh
# Restores a backup made by scripts/backup_db.sh. REPLACES all data in the target database.
#
#   DATABASE_URL=postgresql://user:pass@host:5432/biletflow ./scripts/restore_db.sh backups/biletflow-....dump
#
# A daily backup from GitHub Actions is encrypted (.dump.gpg): decrypt it first with
#   gpg --decrypt --output biletflow.dump biletflow-....dump.gpg
# Afterwards, run "alembic upgrade head" if the backup is older than the code.
set -eu

: "${DATABASE_URL:?set DATABASE_URL to the database to restore INTO}"
FILE="${1:?usage: restore_db.sh <backup.dump> [--yes]}"
# the app's URL may name a driver ("postgresql+psycopg2://"); pg_restore only understands plain "postgresql://"
DB_URL=$(printf '%s' "$DATABASE_URL" | sed 's#^postgresql+[a-z0-9]*://#postgresql://#')
[ -f "$FILE" ] || { echo "no such file: $FILE"; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  printf "This REPLACES all data in the database in DATABASE_URL with %s.\nType yes to continue: " "$FILE"
  read -r answer
  [ "$answer" = "yes" ] || { echo "cancelled"; exit 1; }
fi

# --clean --if-exists: drop each table before recreating it, so the result matches the backup exactly
docker run --rm -i --network host postgres:16 \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DB_URL" < "$FILE"

echo "restored $FILE"
