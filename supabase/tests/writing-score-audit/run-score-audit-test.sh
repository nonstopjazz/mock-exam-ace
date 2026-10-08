#!/usr/bin/env bash
#
# 驗證作文分數稽核的三支查詢。
#
#   bash supabase/tests/writing-score-audit/run-score-audit-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb，不連任何真實環境。
#
# 🛑 最要緊的一條是 B 段：02 重算出來的「目前」必須【等於】真正的
#    writing_score_20()。02/03 為了做 what-if 必須在查詢裡重算一次分數，
#    而重算只要漏掉 UNMEASURED 要排除在分母外、或沒有在類別內先取平均再
#    round，「目前」那一欄就會跟學生真正看到的分數不同 ——
#    那時整張對照表都是假的，而且看起來很合理。
#
# writing_score_20() 從真 migration 抽出來載入，不另寫一份。
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"; ROOT="$DIR/../../.."
DB="${DB:-wscore_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"
TMP="$(mktemp -d /tmp/wscore.XXXXXX)"; chmod 755 "$TMP"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() {
  [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

run_as "createdb $DB"

awk '/CREATE OR REPLACE FUNCTION writing_score_20\(/,/^\$\$;/' \
  "$ROOT/supabase/migrations/create_writing_score_20.sql" > "$TMP/fn.sql"
grep -q "WHEN 'DEVELOPING' THEN 2" "$TMP/fn.sql" || { echo "❌ 分數函式沒抽到"; exit 1; }
chmod 644 "$TMP/fn.sql"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$TMP/fn.sql'" >/dev/null
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/_fixture.sql'" >/dev/null

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 = $2"
          else FAIL=$((FAIL+1)); echo "  ❌ $1：期望 $3，實得 $2"; fi; }
q() { run_as "psql -t -A -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }
runfile() {
  chmod 644 "$DIR/$1"
  run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$DIR/$1'"
}

echo "──────── A. 01 評級分布 ────────"
P01="$(runfile 01-state-distribution.sql)"
row01() { echo "$P01" | grep "^$1|"; }
check "列出 7 篇（QUEUED 的不算）" "$(echo "$P01" | grep -c '|')" "7"
check "全 STRONG → 15 個 skill 都 STRONG" \
      "$(row01 '全部 STRONG' | cut -d'|' -f6)" "5"
check "🛑 全 STRONG 的 STRONG 佔比 100%" \
      "$(row01 '全部 STRONG' | cut -d'|' -f10)" "100"
check "🛑 全 DEVELOPING 的 STRONG 佔比 0%" \
      "$(row01 '全部 DEVELOPING' | cut -d'|' -f10)" "0"
check "含 UNMEASURED 那篇數得出 UNMEASURED" \
      "$(row01 '含 UNMEASURED' | cut -d'|' -f9)" "2"

echo "──────── 🛑 B. 02 的「目前」必須等於真函式 ────────"
P02="$(runfile 02-remap-whatif.sql)"
row02() { echo "$P02" | grep "^$1|"; }
真() { q "SELECT (public.writing_score_20(competency_analysis) ->> 'score')::int
          FROM public.writing_analyses a
          JOIN public.writing_submissions s ON s.id = a.essay_id
         WHERE s.title = '$1'"; }
for t in "全部 STRONG" "全部 ADEQUATE" "全部 DEVELOPING" "含 UNMEASURED" "類別內混合" "像那篇 18 分的"; do
  check "🛑 $t：重算 = 真函式" "$(row02 "$t" | cut -d'|' -f4)" "$(真 "$t")"
done

echo "──────── C. 量表的上下限 ────────"
check "全 STRONG = 20"      "$(row02 '全部 STRONG' | cut -d'|' -f4)"     "20"
check "全 ADEQUATE = 15"    "$(row02 '全部 ADEQUATE' | cut -d'|' -f4)"   "15"
check "🛑 全 DEVELOPING = 10（下限不是 0）" \
      "$(row02 '全部 DEVELOPING' | cut -d'|' -f4)" "10"

echo "──────── 🛑 D. 兩條路的差別（這份稽核的結論）────────"
check "只改公式：全 DEVELOPING 10 → 5"  "$(row02 '全部 DEVELOPING' | cut -d'|' -f5)" "5"
check "只改公式：全 ADEQUATE 15 → 10"   "$(row02 '全部 ADEQUATE' | cut -d'|' -f5)"   "10"

# 🛑 這兩條是整支稽核最重要的結論：「只改公式」保留 STRONG = 4，
#    所以幾乎全 STRONG 的作文幾乎不會降。想把 18 壓到 14，改公式做不到。
check "🛑 只改公式：全 STRONG 仍是 20"  "$(row02 '全部 STRONG' | cut -d'|' -f5)"     "20"
check "🛑 只改公式：那篇 19 分只降 1 分" "$(row02 '像那篇 18 分的' | cut -d'|' -f7)"  "1"

# 🛑 而「AI 評嚴一級」才真的動 —— 這對應改 prompt。
check "🛑 AI嚴一級：全 STRONG 20 → 15"  "$(row02 '全部 STRONG' | cut -d'|' -f6)"     "15"
check "🛑 AI嚴一級：那篇 19 分 → 14（正是老師認為的分數）" \
      "$(row02 '像那篇 18 分的' | cut -d'|' -f6)" "14"
check "AI嚴一級：全 ADEQUATE 15 → 10"   "$(row02 '全部 ADEQUATE' | cut -d'|' -f6)"   "10"

echo "──────── E. 03 總結 ────────"
P03="$(runfile 03-impact-summary.sql)"
v03() { echo "$P03" | grep -F "$1" | head -1 | cut -d'|' -f2; }
check "有分數的篇數 = 7"        "$(v03 '有分數的篇數')" "7"
check "🛑 AI 評嚴一級的平均降幅有算出來" \
      "$(v03 'AI 評嚴一級的平均降幅' | grep -c '[0-9]')" "1"
check "QUEUED 沒被算進去"       "$(q "SELECT count(*) FROM public.writing_analyses WHERE status <> 'COMPLETED'")" "1"
check "STRONG 總數"             "$(v03 'STRONG' | head -1)" "$(q "
  SELECT count(*) FROM public.writing_analyses a
  CROSS JOIN LATERAL jsonb_array_elements(a.competency_analysis -> 'categories') c
  LEFT JOIN LATERAL jsonb_array_elements(c -> 'skills') sk ON true
  WHERE a.status = 'COMPLETED' AND sk ->> 'state' = 'STRONG'")"

echo "──────── 🛑 F. 04 類別內 round 的放大效應 ────────"
P04="$(runfile 04-rounding-inflation.sql)"
row04() { echo "$P04" | grep "^$1|"; }

# 每個類別都是 2 STRONG + 2 ADEQUATE → 平均剛好 3.5 → round 成 4 → 算成全 STRONG。
check "🛑 剛好.5 的作文目前是 20 分"       "$(row04 '每個類別剛好.5' | cut -d'|' -f2)" "20"
check "🛑 不做類別內 round 是 18 分"       "$(row04 '每個類別剛好.5' | cut -d'|' -f3)" "18"
check "🛑 被墊高 2 分"                     "$(row04 '每個類別剛好.5' | cut -d'|' -f4)" "2"
check "🛑 五個類別全部剛好落在 .5"          "$(row04 '每個類別剛好.5' | cut -d'|' -f5)" "5"
check "🛑 五個類別全被往上"                 "$(row04 '每個類別剛好.5' | cut -d'|' -f6)" "5"
check "沒有類別被往下"                      "$(row04 '每個類別剛好.5' | cut -d'|' -f7)" "0"

# 對照：評級一致的作文不受影響（平均是整數，round 不動它）
check "全 STRONG 沒有被墊高"               "$(row04 '全部 STRONG' | cut -d'|' -f4)"   "0"
check "全 ADEQUATE 沒有被墊高"             "$(row04 '全部 ADEQUATE' | cut -d'|' -f4)" "0"
check "全 DEVELOPING 沒有被墊高"           "$(row04 '全部 DEVELOPING' | cut -d'|' -f4)" "0"

echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
