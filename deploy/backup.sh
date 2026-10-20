#!/bin/sh
# Nightly PostgreSQL dump, kept for 14 days. Run as root (Docker access). Cron:
#   15 3 * * * sh /home/ubuntu/plano/deploy/backup.sh >> /root/plano-backups/backup.log 2>&1
# Check a dump with deploy/verify-backup.sh.
set -eu

cd "$(dirname "$0")/.."
# Dumps contain password hashes and session data: owner-only access.
umask 077
backup_dir="${BACKUP_DIR:-$HOME/plano-backups}"
mkdir -p "$backup_dir"

file="$backup_dir/plano-$(date +%Y%m%d-%H%M%S).sql.gz"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# Dump to a plain file first: in `pg_dump | gzip`, a failing pg_dump would
# still produce a valid-looking archive and the script would report success.
docker compose -f compose.prod.yaml exec -T db pg_dump --clean --if-exists -U plano -d plano > "$partial"
gzip -c "$partial" > "$file"

find "$backup_dir" -name 'plano-*.sql.gz' -mtime +14 -delete
echo "$(date '+%F %T') Backup written to $file ($(du -h "$file" | cut -f1))"
