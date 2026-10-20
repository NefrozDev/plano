#!/bin/sh
# Restores a dump into a throwaway PostgreSQL container and prints the row
# count of every table, proving the backup is usable without touching
# production. Run as root (Docker access).
# Usage: sh deploy/verify-backup.sh [dump.sql.gz]   (default: newest backup)
set -eu

backup_dir="${BACKUP_DIR:-$HOME/plano-backups}"
file="${1:-$(ls -1t "$backup_dir"/plano-*.sql.gz 2>/dev/null | head -n 1)}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "No backup found in $backup_dir" >&2
  exit 1
fi

container="plano-verify-$$"
docker run --detach --rm --name "$container" --memory 256m \
  -e POSTGRES_USER=plano -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=plano \
  postgres:18-alpine > /dev/null
trap 'docker stop "$container" > /dev/null 2>&1 || true' EXIT

# The image's init server only listens on a socket; waiting for TCP skips it.
tries=0
until docker exec "$container" pg_isready -h 127.0.0.1 -U plano -d plano > /dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "Temporary PostgreSQL did not start" >&2
    exit 1
  fi
  sleep 1
done

gunzip -c "$file" | docker exec -i "$container" \
  psql -h 127.0.0.1 -U plano -d plano -v ON_ERROR_STOP=1 --quiet > /dev/null

docker exec "$container" psql -h 127.0.0.1 -U plano -d plano -c "
  SELECT table_name AS \"table\",
         (xpath('/row/c/text()', query_to_xml(
           format('SELECT count(*) AS c FROM public.%I', table_name),
           false, true, '')))[1]::text::int AS rows
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY 1;"

echo "Backup OK: $file restored without errors."
