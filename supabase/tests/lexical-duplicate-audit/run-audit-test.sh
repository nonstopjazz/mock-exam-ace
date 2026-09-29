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
check "受影響組數 C1 C2 C3 C8 C9 C10 C11" "$(val '受影響的作答組數')"   "7"
check "會動熟練度的（C8 不算，它只留證據）"  "$(val '會動熟練度的')"     "6"
check "判定矛盾 C1 C2 + 🛑SRS 的 C9"       "$(val '判定互相矛盾')"     "3"
check "其中含 timeout（只有 C2）"          "$(val '含倒數計時歸零')"   "1"
check "純重複 C3 C8 C10 C11"              "$(val '純重複')"          "4"
check "多出來的列"                        "$(val '多出來的資料列')"   "9"
check "熟練度多算（C8 不貢獻）"             "$(val '熟練度被多算的次數')" "7"
check "受影響學生數"                      "$(val '受影響的學生數')"   "2"
check "受影響單字數"                      "$(val '受影響的單字數')"   "3"

echo "──────── 03 判定矛盾明細 ────────"
P03="$(q 03-contradictory.sql)"
check "列出 3 組（含 SRS 那組）"    "$(echo "$P03" | grep -c '|')"              "3"
check "timeout 可判定 1 組"        "$(echo "$P03" | grep -c 'timeout 可判定')" "1"
check "🛑 無法判定 2 組"           "$(echo "$P03" | grep -c '無法判定')"       "2"
check "🛑 SRS 那組有被抓到"         "$(echo "$P03" | grep -c '|srs|')"          "1"

echo "──────── 04 熟練度影響 ────────"
P04="$(q 04-mastery-impact.sql)"
check "六組 學生×單字 受影響"      "$(echo "$P04" | grep -c '|')" "6"
# 🛑 學生實際感受到的是舊表。接不上的話這幾欄會是空的，等於白做。
#    crucial 在 04 裡有兩列（S1 的 srs、S2 的 match），要指名學生才不會抓錯。
S1ROW="$(echo "$P04" | grep '^crucial|' | grep '11111111-1111-1111-1111-111111111111')"
check "🛑 S1/crucial 接得到舊表熟練度"      "$(echo "$S1ROW" | cut -d'|' -f6)" "2"
check "🛑 扣掉多算後應為 1（10 分鐘，不是 1 天）" "$(echo "$S1ROW" | cut -d'|' -f7)" "1"
check "舊表下次複習有值（不是空的）"         "$(echo "$S1ROW" | cut -d'|' -f9 | grep -c '20')" "1"

echo "──────── 05 依題型組成 ────────"
P05="$(q 05-by-exercise-type.sql)"
tval() { echo "$P05" | grep "^$1|" | cut -d'|' -f5; }
check "🛑 srs 的多餘列（舊版完全漏掉）"  "$(tval srs)"        "2"
check "match 的多餘列（C8 證據 + C11 熟練度）" "$(tval match)" "3"
check "quick_quiz 的多餘列"             "$(tval quick_quiz)" "2"
check "spelling 沒有重複"               "$(tval spelling)"   "0"
check "合計列數 = fixture 全部"          "$(echo "$P05" | grep '合計' | cut -d'|' -f2)" "23"
check "合計多餘列 與 01 一致"            "$(echo "$P05" | grep '合計' | cut -d'|' -f5)" "9"

echo
echo "🛑 以下是【不該被抓到】的對照，靠上面的總數反證："
echo "   C4 相隔 15 分鐘的真重複 / C5 不同題型 / C6 不同學生"
echo "   C7 不同 session"
echo "   任何一項被誤抓，01 的組數就不會是 7。"
echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
