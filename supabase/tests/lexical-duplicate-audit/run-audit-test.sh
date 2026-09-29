#!/usr/bin/env bash
#
# 用種好的已知案例，驗證這份稽核【真的只抓到該抓的】。
#
#   bash supabase/tests/lexical-duplicate-audit/run-audit-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#
# 這支跑的是 00～05 的【原檔】，不是複製品 —— 所以查詢改了、假設變了，
# 這裡就會紅。種下去的案例裡有六組是刻意不該被抓到的對照
# （相隔 15 分鐘的真重複、不同題型、不同學生、不同 session、配對遊戲），
# 少了它們，這份稽核只證明得了「會抓東西」，證明不了「沒有亂抓」。
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"
DB="${DB:-lexdup_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() { [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_as "createdb $DB"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/_fixture.sql'" >/dev/null

q() { run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$DIR/$1'"; }

PASS=0; FAIL=0
check() { # check <說明> <實際> <期望>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 = $2"
  else FAIL=$((FAIL+1)); echo "  ❌ $1：期望 $3，實得 $2"; fi
}

echo "──────── 00 preflight ────────"
P00="$(q 00-preflight.sql)"
check "五項檢查都跑出來" "$(echo "$P00" | grep -c '|')" "5"
check "表存在那項為 true" "$(echo "$P00" | grep '^1\.' | cut -d'|' -f3)" "t"

echo "──────── 01 總覽（核心）────────"
P01="$(q 01-overview.sql)"
val() { echo "$P01" | grep -F "$1" | head -1 | cut -d'|' -f2; }
check "受影響組數（C1 C2 C3）"      "$(val '受影響的作答組數')"   "3"
check "一對一錯（C1 C2）"          "$(val '一對一錯')"           "2"
check "其中含 timeout（只有 C2）"  "$(val '含倒數計時歸零')"     "1"
check "純重複（只有 C3）"          "$(val '純重複')"             "1"
check "多出來的列 1+1+2"           "$(val '多出來的資料列')"     "4"
check "熟練度多算 1+1+2"           "$(val '熟練度被多算的次數')" "4"
check "受影響學生數"               "$(val '受影響的學生數')"     "2"
check "受影響單字數"               "$(val '受影響的單字數')"     "2"

echo "──────── 03 一對一錯明細 ────────"
P03="$(q 03-contradictory.sql)"
check "列出 2 組"                  "$(echo "$P03" | grep -c '|')"              "2"
check "timeout 可判定 1 組"        "$(echo "$P03" | grep -c 'timeout 可判定')" "1"
check "🛑 無法判定 1 組"           "$(echo "$P03" | grep -c '無法判定')"       "1"

echo "──────── 04 熟練度影響 ────────"
P04="$(q 04-mastery-impact.sql)"
check "三組 學生×單字 受影響"      "$(echo "$P04" | grep -c '|')" "3"
check "S2/abandon 被多算 2 次"     "$(echo "$P04" | grep '^abandon|2' | cut -d'|' -f3)" "2"

echo "──────── 05 對照組 ────────"
P05="$(q 05-control-evidence-only.sql)"
check "match 的多餘列 = 2（是證據，不是 bug）" \
      "$(echo "$P05" | grep '^match|' | cut -d'|' -f3)" "2"

echo
echo "🛑 以下是【不該被抓到】的對照，靠上面的總數反證："
echo "   C4 相隔 15 分鐘的真重複 / C5 不同題型 / C6 不同學生"
echo "   C7 不同 session / C8 配對遊戲"
echo "   任何一項被誤抓，01 的組數就不會是 3。"
echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
