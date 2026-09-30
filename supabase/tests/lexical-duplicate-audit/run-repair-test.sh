#!/usr/bin/env bash
#
# 驗證 06（修正預覽）的邏輯。
#
#   bash supabase/tests/lexical-duplicate-audit/run-repair-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#
# 跑的是 06 的【原檔】，只把 target 裡的三個 production 學生 id 換成
# fixture 的 id（那三行是資料，不是邏輯）。判定唯一解、偵測分析過期、
# 重算複習時間這三段邏輯完全沒動。
#
# lexical_compat_review_interval 從真正的 migration 抽出來載入，
# 不另寫一份 —— 間隔表哪天改了，這裡要跟著動。
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"; ROOT="$DIR/../../.."
DB="${DB:-lexrepair_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"
# 🛑 要讓 postgres 使用者讀得到，所以放在 /tmp 並開讀取權限。
TMP="$(mktemp -d /tmp/lexrepair.XXXXXX)"
chmod 755 "$TMP"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() {
  [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

run_as "createdb $DB"

# 從真 migration 抽出間隔函式（自成一體：純 SQL、IMMUTABLE、SET search_path=''）
awk '/CREATE OR REPLACE FUNCTION lexical_compat_review_interval/,/^\$\$;/' \
  "$ROOT/supabase/migrations/create_lexical_rpcs.sql" > "$TMP/fn.sql"
grep -q "INTERVAL '14 days'" "$TMP/fn.sql" || { echo "❌ 間隔函式沒抽到"; exit 1; }
chmod 644 "$TMP/fn.sql"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$TMP/fn.sql'" >/dev/null
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/_fixture-repair.sql'" >/dev/null

# 只換 target 的三個 id，邏輯一字不動
sed -e "s/bb34c69e-b7a4-4127-baa6-5a25bf3c6770/aaaa0001-0000-0000-0000-000000000001/" \
    -e "s/0aea72e3-26d5-409e-9992-a59936fd3abd/aaaa0002-0000-0000-0000-000000000002/" \
    -e "s/dbe40a1f-9594-4f8c-b49f-e874ef1ef292/aaaa0003-0000-0000-0000-000000000003/" \
    "$DIR/06-repair-preview.sql" > "$TMP/06.sql"
diff <(grep -c '' "$DIR/06-repair-preview.sql") <(grep -c '' "$TMP/06.sql") >/dev/null \
  || { echo "❌ 代換改動了行數，不只換 id"; exit 1; }

chmod 644 "$TMP/06.sql"
OUT="$(run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$TMP/06.sql'")"
echo "$OUT" | sed 's/^/    /'
echo

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 = $2"
          else FAIL=$((FAIL+1)); echo "  ❌ $1：期望 $3，實得 $2"; fi; }
row() { echo "$OUT" | grep "^$1|"; }
f() { echo "$2" | cut -d'|' -f"$1"; }

R1="$(row interact)"; R2="$(row airline)"; R3="$(row armchair)"

check "列出 3 列"                      "$(echo "$OUT" | grep -c '|')" "3"

echo "  ── R1：多算 3，可反推，修完已到期 ──"
check "多算現場算出 3"                  "$(f 3 "$R1")" "3"
check "與當初觀測一致"                  "$(f 2 "$R1")" "✅ 一致"
check "舊表熟練度 5 → 2"               "$(f 5 "$R1")" "2"
check "舊表複習 5 → 2"                 "$(f 7 "$R1")" "2"
check "🛑 修完立刻可複習"               "$(f 10 "$R1")" "修完立刻可複習"
check "新表 4 → 1"                     "$(f 12 "$R1")" "1"

echo "  ── R2：熟練度 6（上限），修完還沒到期 ──"
check "舊表熟練度 6 → 5"               "$(f 5 "$R2")" "5"
check "🛑 備註為空（14 天後才到期）"     "$(f 10 "$R2")" ""
# 🛑 新表 1/1 而多算 1 → 反推會得 0，那是算式失效不是正確值。
check "🛑 複習次數不大於多算 → 不可反推" "$(f 12 "$R2")" "🛑 不可反推"

echo "  ── R3：兩道防線都該亮 ──"
check "🛑 偵測到分析已過期"             "$(f 2 "$R3")" "🛑 不一致：分析已過期，重跑 01/04"
check "🛑 熟練度 3≠複習 7 → 不可反推"   "$(f 5 "$R3")" "🛑 不可反推"
check "🛑 複習次數也不給建議"           "$(f 7 "$R3")" "🛑 不可反推"
check "🛑 複習時間也不給建議"           "$(f 9 "$R3")" "🛑 不可反推"

echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
