#!/usr/bin/env bash
#
# 驗證作文分數稽核的兩支查詢，以及等距改版後的 writing_score_20()。
#
#   bash supabase/tests/writing-score-audit/run-score-audit-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb，不連任何真實環境。
#
# 🛑 最要緊的是 B 段：02 重算出來的分數必須【等於】真正的 writing_score_20()。
#    02 為了做新舊對照必須在查詢裡重算一次，而重算只要漏掉
#    「UNMEASURED 排除在分母外」或「類別內不 round」，那一欄就會跟學生
#    真正看到的分數不同 —— 那時整張對照表都是假的，而且看起來很合理。
#
# 函式從【等距改版的 migration】抽出來載入，不另寫一份。
#
# 🛑 順便把 writing_score_20_test.sql 收進來跑 —— 它在這之前
#    【沒有任何 runner】。那支測的是分數換算的每一條規則
#    （UNMEASURED 不拉低分數、類別內不 round、壞資料回 NULL、anon 叫不動）。
#    測試存在卻沒人跑，等於沒有。
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"; ROOT="$DIR/../../.."
# 🛑 這裡要指向【最新】的那支 migration，不是最早的。
#    指錯的話測的是舊函式，而測試會全部通過 —— 那種綠燈最貴。
MIG="$ROOT/supabase/migrations/add_writing_state_minimal.sql"
DB="${DB:-wscore_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"
TMP="$(mktemp -d /tmp/wscore.XXXXXX)"; chmod 755 "$TMP"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
DBS_EXTRA=""
cleanup() {
  if [ "${KEEP_DB:-0}" != "1" ]; then
    run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true
    [ -n "$DBS_EXTRA" ] && run_as "dropdb --if-exists $DBS_EXTRA" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

run_as "createdb $DB"

awk '/CREATE OR REPLACE FUNCTION writing_score_20\(/,/^\$\$;/' "$MIG" > "$TMP/fn.sql"
# 🛑 -E 且容忍對齊用的空白：migration 裡的 CASE 是對齊過的
#    （WHEN 'MINIMAL'    THEN 0）。寫死單一空格會在函式其實正確時誤報。
grep -qE "WHEN 'DEVELOPING' +THEN 1" "$TMP/fn.sql" || { echo "❌ 等距版函式沒抽到"; exit 1; }
grep -qE "WHEN 'MINIMAL' +THEN 0"    "$TMP/fn.sql" || { echo "❌ 抽到的函式沒有 MINIMAL = 0"; exit 1; }
# 🛑 這一條是回歸保護：類別內的 round 不可以回來。
if grep -q "round(avg_points)" "$TMP/fn.sql"; then
  echo "❌ 抽到的函式還有類別內 round —— 那個偏差是單向的，不可以回來"; exit 1
fi
# 🛑 不認得的 state 必須 fail loud。少了這段，prompt 先上線的話分數會偏高。
grep -q "NOT IN" "$TMP/fn.sql" || { echo "❌ 抽到的函式沒有「不認得的 state」檢查"; exit 1; }
chmod 644 "$TMP/fn.sql"
# anon 要存在，writing_score_20_test 的 E 段會檢查它叫不動這支函式
run_as "psql -q -d $DB -c 'CREATE ROLE anon'" >/dev/null 2>&1 || true
run_as "psql -q -d $DB -c 'CREATE ROLE authenticated'" >/dev/null 2>&1 || true
run_as "psql -q -d $DB -c 'CREATE ROLE service_role'" >/dev/null 2>&1 || true
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$TMP/fn.sql'" >/dev/null
grep -E "^(REVOKE|GRANT) .*writing_score_20" "$MIG" > "$TMP/grants.sql"
chmod 644 "$TMP/grants.sql"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$TMP/grants.sql'" >/dev/null
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/_fixture.sql'" >/dev/null

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 = $2"
          else FAIL=$((FAIL+1)); echo "  ❌ $1：期望 $3，實得 $2"; fi; }
q() { run_as "psql -t -A -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }
runfile() { chmod 644 "$DIR/$1"
  run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$DIR/$1'"; }

echo "──────── A. 01 評級分布 ────────"
P01="$(runfile 01-state-distribution.sql)"
row01() { echo "$P01" | grep "^$1|"; }
# 🛑 01 多了 MINIMAL 欄之後，佔比欄從 f10 變成 f11、UNMEASURED 從 f9 變成 f10。
#    欄位位置是用 cut 取的，加欄位一定要一起改這裡。
check "列出 10 篇（QUEUED 的不算）"       "$(echo "$P01" | grep -c '|')" "10"
check "🛑 全 STRONG 的 STRONG 佔比 100%"   "$(row01 '全部 STRONG' | cut -d'|' -f11)" "100"
check "🛑 全 DEVELOPING 的 STRONG 佔比 0%" "$(row01 '全部 DEVELOPING' | cut -d'|' -f11)" "0"
check "含 UNMEASURED 那篇數得出 UNMEASURED" "$(row01 '含 UNMEASURED' | cut -d'|' -f10)" "2"
check "🛑 全 MINIMAL 那篇數得出 5 個 MINIMAL" "$(row01 '全部 MINIMAL' | cut -d'|' -f9)" "5"
# 🛑 MINIMAL 算在「有量到」裡，所以全 MINIMAL 的 STRONG 佔比是 0 而不是空的。
#    若誤把 MINIMAL 當成 UNMEASURED，分母會變 0，這一欄會是空白。
check "🛑 全 MINIMAL 的 STRONG 佔比是 0（不是空白）" \
      "$(row01 '全部 MINIMAL' | cut -d'|' -f11)" "0"

echo "──────── 🛑 B. 02 的重算必須等於真函式 ────────"
P02="$(runfile 02-verify-formula.sql)"
row02() { echo "$P02" | grep "^$1|"; }
for t in "全部 STRONG" "全部 ADEQUATE" "全部 DEVELOPING" "含 UNMEASURED" \
         "類別內混合" "像那篇 18 分的" "每個類別剛好.5" \
         "全部 MINIMAL" "爛但不是全爛" "MINIMAL 與未評量並存"; do
  check "🛑 $t：驗收欄" "$(row02 "$t" | cut -d'|' -f7)" "✅ 相符"
done
check "十篇全部相符（沒有一篇不符）" "$(echo "$P02" | grep -c '✅ 相符')" "10"

echo "──────── C. 等距之後的端點 ────────"
check "全 STRONG 仍是 20"    "$(row02 '全部 STRONG' | cut -d'|' -f2)"   "20"
check "全 ADEQUATE 15 → 13"  "$(row02 '全部 ADEQUATE' | cut -d'|' -f2)" "13"
check "🛑 全 DEVELOPING 仍是 7（新增 MINIMAL 不該動到既有評級）" \
      "$(row02 '全部 DEVELOPING' | cut -d'|' -f2)" "7"

echo "──────── 🛑 C2. 0–6 這一段到得了 ────────"
# 這是這次改動的全部目的。在 MINIMAL 之前，這三個數字算不出來。
check "🛑 全 MINIMAL = 0（新下限）"        "$(row02 '全部 MINIMAL' | cut -d'|' -f2)" "0"
check "🛑 爛但不是全爛 = 3（落在區間中間）" "$(row02 '爛但不是全爛' | cut -d'|' -f2)" "3"
# 🛑 這一條是對照組：MINIMAL 算進分母、UNMEASURED 不算。
#    若誤把 MINIMAL 也排除，9/9 會算出 20 —— 差 5 分，而且看起來正常。
check "🛑 MINIMAL 與未評量並存 = 15（誤排除會變 20）" \
      "$(row02 'MINIMAL 與未評量並存' | cut -d'|' -f2)" "15"
# 含 MINIMAL 的作文，舊公式欄必須留空而不是編一個數字
check "🛑 全 MINIMAL 的「舊公式」欄是空的（舊賦值沒有這個狀態）" \
      "$(row02 '全部 MINIMAL' | cut -d'|' -f4)" ""

echo "──────── 🛑 D. 類別內不再 round ────────"
# 每個類別都是「一半 STRONG、一半 ADEQUATE」。
# 舊公式：avg(4,3) = 3.5 → round 4 → 整篇 20 分（算成完全 STRONG）。
# 新公式：avg(3,2) = 2.5 留著 → 20 × 12.5/15 = 16.7 → 17。
check "🛑 剛好.5 的那篇現在是 17 分" "$(row02 '每個類別剛好.5' | cut -d'|' -f2)" "17"
check "🛑 舊公式會把它算成 20 分"    "$(row02 '每個類別剛好.5' | cut -d'|' -f4)" "20"
check "🛑 所以降了 3 分"             "$(row02 '每個類別剛好.5' | cut -d'|' -f5)" "3"
check "🛑 舊公式有 5 個類別被墊高"   "$(row02 '每個類別剛好.5' | cut -d'|' -f6)" "5"
# 對照：評級一致的作文平均是整數，舊公式也不會墊高它們。
# 少了這組對照，上面那些只證明得了「算得出差額」，證明不了「只動該動的」。
check "全 STRONG 在舊公式沒被墊高"   "$(row02 '全部 STRONG' | cut -d'|' -f6)"   "0"
check "全 ADEQUATE 在舊公式沒被墊高" "$(row02 '全部 ADEQUATE' | cut -d'|' -f6)" "0"

echo "──────── E. 降幅的方向 ────────"
# 🛑 頂端幾乎不動、底部降幅溫和 —— 這是選等距而非 1/2/4 的理由。
#    1/2/4 的間距不等，會讓底部一律掉 5 分、頂端幾乎不動。
check "🛑 全 STRONG 降幅 0（頂端不動）" "$(row02 '全部 STRONG' | cut -d'|' -f5)"     "0"
check "🛑 全 DEVELOPING 降幅 3"         "$(row02 '全部 DEVELOPING' | cut -d'|' -f5)" "3"
check "全 ADEQUATE 降幅 2"              "$(row02 '全部 ADEQUATE' | cut -d'|' -f5)"   "2"

echo "──────── F. 壞資料 ────────"
check "QUEUED 的不算進任何一支" \
      "$(q "SELECT count(*) FROM public.writing_analyses WHERE status <> 'COMPLETED'")" "1"
check "分析未完成時沒有分數" "$(q "
  SELECT coalesce((public.writing_score_20(competency_analysis) ->> 'score'), 'NULL')
    FROM public.writing_analyses WHERE status = 'QUEUED'")" "NULL"

echo
echo "──────── G. writing_score_20_test（原本沒有 runner 在跑）────────"
# 🛑 另外建一個資料庫。兩邊都定義 t_comp()，而且參數名不同
#    （p_cats vs p_states）—— 共用同一個庫的話 CREATE OR REPLACE 會直接報
#    「cannot change name of input parameter」。
#    這跟 run-learn-tasks.sh 踩過的是同一類問題：測試共用資料庫會互相踩。
DB2="${DB}_wst"; DBS_EXTRA="$DB2"
run_as "createdb $DB2"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB2 -f '$TMP/fn.sql'" >/dev/null
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB2 -f '$TMP/grants.sql'" >/dev/null

# 它自己用 RAISE NOTICE / RAISE EXCEPTION 回報，所以單獨算。
if run_as "psql -q -v ON_ERROR_STOP=1 -d $DB2 -f '$ROOT/supabase/tests/writing_score_20_test.sql'" \
     > "$TMP/wst.txt" 2>&1; then
  N=$(grep -c "PASS" "$TMP/wst.txt" || true)
  echo "  ✅ 全部通過（$N 條）"
  PASS=$((PASS + N))
else
  echo "  ❌ 有未通過的："
  grep -E "FAIL|ERROR" "$TMP/wst.txt" | sed 's/^psql[^ ]* //' | head -5
  FAIL=$((FAIL + 1))
fi

echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
