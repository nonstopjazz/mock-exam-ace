#!/usr/bin/env bash
#
# 錯誤追蹤四支查詢 RPC 的資料層測試。
#
#   bash supabase/tests/run-error-query-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb，不連任何真實環境。
#
# 🛑 writing_error_query_rpcs_test.sql 在這之前【沒有任何 runner】。
#    537 行、65 條斷言，包括守住「沒有門檻」那條規則的 T3 / T7 / T12 ——
#    而那條規則是這個功能存在的理由。測試存在卻沒人跑，等於沒有。
#
# 測試檔自己用 \ir 載入真正的 migration，所以這裡不另外抄一份 SQL。
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"
DB="${DB:-wq_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"
TMP="$(mktemp -d /tmp/wq.XXXXXX)"; chmod 755 "$TMP"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() {
  [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

run_as "createdb $DB"
for r in anon authenticated service_role; do
  run_as "psql -q -d $DB -c 'CREATE ROLE $r'" >/dev/null 2>&1 || true
done

# 測試檔用 \ir 走相對路徑，所以要讓 postgres 讀得到整個 repo 的 migrations。
# 這裡只給讀取權，而且是本機臨時資料庫。
chmod -R a+rX "$DIR" "$DIR/../migrations" 2>/dev/null || true

if run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/writing_error_query_rpcs_test.sql'" \
     > "$TMP/out.txt" 2>&1; then
  PASS=$(grep -c "PASS" "$TMP/out.txt" || true)
  echo "✅ 全部通過（$PASS 條）"
  # 🛑 把守住「沒有門檻」那幾條單獨列出來。它們若消失（不是失敗，是【沒跑到】），
  #    上面的「全部通過」會是假的綠燈。
  echo "──── 關鍵斷言 ────"
  grep -E "PASS  🛑" "$TMP/out.txt" | sed 's/^[A-Z]*:  */  /' | head -20
  exit 0
else
  echo "❌ 有未通過的："
  grep -E "FAIL|ERROR" "$TMP/out.txt" | sed 's/^psql[^ ]* //' | head -10
  echo "（完整輸出：$TMP/out.txt，加 KEEP_DB=1 可保留資料庫）"
  cp "$TMP/out.txt" /tmp/wq-last-failure.txt 2>/dev/null || true
  echo "（已複製到 /tmp/wq-last-failure.txt）"
  exit 1
fi
