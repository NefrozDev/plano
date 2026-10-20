#!/bin/sh
# Nightly PostgreSQL dump, kept for 14 days. Cron example:
#   15 3 * * * sh /home/ubuntu/plano/deploy/backup.sh >> /root/plano-backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."
backup_dir="${BACKUP_DIR:-$HOME/plano-backups}"
mkdir -p "$backup_dir"

file="$backup_dir/plano-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f compose.prod.yaml exec -T db pg_dump -U plano -d plano | gzip > "$file"
find "$backup_dir" -name 'plano-*.sql.gz' -mtime +14 -delete
echo "Backup written to $file"
