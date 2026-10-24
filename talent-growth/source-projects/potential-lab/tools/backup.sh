#!/usr/bin/env bash
# 数据库备份与恢复（SQLite；上线 PostgreSQL 后替换为 pg_dump/pg_restore）
# 用法：
#   ./backup.sh backup  [文件名]     # 备份（默认按时间戳命名）
#   ./backup.sh restore <文件名>     # 恢复（覆盖当前库，慎用）
set -euo pipefail
cd "$(dirname "$0")/../backend"

DB="potential_lab.db"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="../backups"
mkdir -p "$BACKUP_DIR"

case "${1:-backup}" in
  backup)
    FILE="${2:-$BACKUP_DIR/$DB-$STAMP.bak}"
    sqlite3 "$DB" ".backup '$FILE'"
    echo "已备份 → $FILE"
    echo "校验："
    sqlite3 "$FILE" "PRAGMA integrity_check; SELECT COUNT(*) || ' users' FROM users;"
    ;;
  restore)
    FILE="${2:?用法：restore <备份文件>}"
    if [ ! -f "$FILE" ]; then echo "备份文件不存在：$FILE"; exit 1; fi
    sqlite3 "$FILE" "PRAGMA integrity_check;" >/dev/null
    cp "$FILE" "$DB"
    echo "已恢复 ← $FILE"
    sqlite3 "$DB" "SELECT COUNT(*) || ' users' FROM users;"
    ;;
  *)
    echo "用法：$0 {backup|restore} [文件]"; exit 1 ;;
esac
