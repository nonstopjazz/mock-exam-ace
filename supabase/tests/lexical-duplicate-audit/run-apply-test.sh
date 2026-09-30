#!/usr/bin/env bash
#
# 驗證 07（實際的修正）。
#
#   bash supabase/tests/lexical-duplicate-audit/run-apply-test.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#    這支【不會】連到任何真實環境 —— 它建一個臨時資料庫，把 07 跑在替身資料上。
#
# 🛑 07 是一字不改地跑的（fixture 直接用 production 的 UUID），
#    所以測到的就是要跑在 production 上的那份。
#
# 三件必須證明的事：
#   1. 三列都改成核可過的數值，複習時間用間隔函式重算正確
#   2. 🛑 幂等：再跑一次什麼都不會變（樂觀鎖擋下）
#   3. 🛑 範圍：名單外的資料一列都不能動
set -euo pipefail

cd "$(dirname "$0")"
DIR="$PWD"; ROOT="$DIR/../../.."
DB="${DB:-lexapply_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"
TMP="$(mktemp -d /tmp/lexapply.XXXXXX)"; chmod 755 "$TMP"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() {
  [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

run_as "createdb $DB"

# 間隔函式從真 migration 抽出來，不另寫一份
awk '/CREATE OR REPLACE FUNCTION lexical_compat_review_interval/,/^\$\$;/' \
  "$ROOT/supabase/migrations/create_lexical_rpcs.sql" > "$TMP/fn.sql"
grep -q "INTERVAL '14 days'" "$TMP/fn.sql" || { echo "❌ 間隔函式沒抽到"; exit 1; }
chmod 644 "$TMP/fn.sql"
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$TMP/fn.sql'" >/dev/null
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/_fixture-apply.sql'" >/dev/null

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✅ $1 = $2"
          else FAIL=$((FAIL+1)); echo "  ❌ $1：期望 $3，實得 $2"; fi; }

q() { run_as "psql -t -A -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }
snapshot() {
  q "SELECT string_agg(user_id || ':' || word_id || '=' || mastery_level || '/' ||
       review_count || '@' || next_review_time, ' | ' ORDER BY word_id)
     FROM public.user_word_progress"
}
apply() { run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/07-repair-apply.sql'" > "$TMP/out.txt" 2>&1 || {
            echo "❌ 07 執行失敗（不該失敗）"; cat "$TMP/out.txt"; exit 1; }; }

# 07 的原子性斷言會 RAISE，psql 因此回非零 —— 那是【預期】行為，不是壞掉。
apply_expect_rollback() {
  if run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$DIR/07-repair-apply.sql'" > "$TMP/out.txt" 2>&1; then
    echo "❌ 預期要回滾，但 07 正常結束了"; cat "$TMP/out.txt"; exit 1
  fi
}

DECOY_BEFORE="$(q "SELECT mastery_level || '/' || review_count || '@' || next_review_time
                   FROM public.user_word_progress WHERE word_id = 'lw-decoy'")"

echo "──────── 08 診斷（唯讀）────────"
# 修正前跑一次：三列都該說「條件全過」。
chmod 644 "$DIR/08-why-blocked.sql" 2>/dev/null || true
if ! run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$DIR/08-why-blocked.sql'" \
     > "$TMP/d.txt" 2>&1; then
  echo "❌ 08 執行失敗"; cat "$TMP/d.txt"; exit 1
fi
check "08 列出 3 列"                "$(grep -c '|' "$TMP/d.txt")" "3"
check "修正前：兩張表共 6 欄都說條件全過" \
      "$(grep -o '條件全過' "$TMP/d.txt" | wc -l | tr -d ' ')" "6"

echo "──────── 第一次跑 07 ────────"
apply
grep -E "已修正|沒改到" "$TMP/out.txt" | sed 's/^/    /' || true
echo
check "三列都回報已修正" "$(grep -c '✅ 已修正' "$TMP/out.txt")" "3"

old() { q "SELECT mastery_level || '/' || review_count FROM public.user_word_progress
           WHERE word_id = '$1'"; }
oldnext() { q "SELECT to_char(to_timestamp(next_review_time/1000.0) AT TIME ZONE 'UTC',
                 'YYYY-MM-DD HH24:MI:SS.MS') FROM public.user_word_progress WHERE word_id = '$1'"; }
newm() { q "SELECT mastery_level || '/' || review_count FROM public.student_lexical_mastery m
            JOIN public.lexical_items li ON li.id = m.lexical_item_id WHERE li.lemma = '$1'"; }
newnext() { q "SELECT to_char(next_review_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS')
               FROM public.student_lexical_mastery m
               JOIN public.lexical_items li ON li.id = m.lexical_item_id WHERE li.lemma = '$1'"; }

echo "  ── 舊表（學生實際感受到的）──"
check "interact 5/5 → 2/2"            "$(old lw-interact)" "2/2"
check "interact next = last +1 天"     "$(oldnext lw-interact)" "2026-09-28 13:08:58.047"
check "airline 6/6 → 5/5"             "$(old lw-airline)"  "5/5"
check "airline next = last +14 天"     "$(oldnext lw-airline)"  "2026-10-07 05:45:25.962"
check "armchair 2/2 → 1/1"            "$(old lw-armchair)" "1/1"
check "armchair next = last +10 分"    "$(oldnext lw-armchair)" "2026-09-28 08:03:46.493"
# 🛑 第一版漏了這個 —— 舊表的 SRS easy 會加 correct_count，連點那幾次也加了。
oldc() { q "SELECT correct_count FROM public.user_word_progress WHERE word_id = '$1'"; }
check "🛑 interact 答對 5 → 2（一起扣）" "$(oldc lw-interact)" "2"
check "🛑 airline 答對 6 → 5"           "$(oldc lw-airline)"  "5"
check "🛑 armchair 答對 2 → 1"          "$(oldc lw-armchair)" "1"

echo "  ── 新表（平行紀錄）──"
check "interact 5/5 → 2/2"            "$(newm interact)" "2/2"
check "interact next = last +1 天"     "$(newnext interact)" "2026-09-28 13:08:58.047"
check "🛑 airline 2/2 → 1/1（起算點與舊表不同）" "$(newm airline)" "1/1"
check "airline next = last +10 分"     "$(newnext airline)" "2026-09-23 05:55:25.962"
check "armchair 2/2 → 1/1"            "$(newm armchair)" "1/1"

echo "  ── 範圍 ──"
check "🛑 名單外的資料沒被動到" \
      "$(q "SELECT mastery_level || '/' || review_count || '@' || next_review_time
            FROM public.user_word_progress WHERE word_id = 'lw-decoy'")" "$DECOY_BEFORE"

echo
echo "──────── 🛑 第二次跑 07（幂等）────────"
BEFORE="$(snapshot)"
apply
AFTER="$(snapshot)"
check "再跑一次，舊表一個位元都沒變" "$([ "$BEFORE" = "$AFTER" ] && echo same || echo CHANGED)" "same"
# 驗收問的是「資料現在對不對」，不是「這次改了沒」。
# 已經對了就該回報已修正 —— 這是對的語意，不是漏擋。
check "第二次仍回報三列已修正（狀態正確）" "$(grep -c '✅ 已修正' "$TMP/out.txt")" "3"
check "interact 沒有被再扣一輪"      "$(old lw-interact)" "2/2"
check "🛑 airline 沒有從 5/5 掉到 4/4" "$(old lw-airline)" "5/5"

echo
echo "──────── 08 診斷（修正後）────────"
run_as "psql -t -A -F'|' -v ON_ERROR_STOP=1 -d $DB -f '$DIR/08-why-blocked.sql'" > "$TMP/d2.txt" 2>&1
check "修正後：兩張表共 6 欄都說已是修正後的值" \
      "$(grep -o '已經是修正後的值' "$TMP/d2.txt" | wc -l | tr -d ' ')" "6"

echo
echo "──────── 🛑 樂觀鎖擋下的情形 ────────"
# 模擬「06 之後那位學生又複習了一次」：把 interact 推回 3/3。
# expect_* 是 5/5，對不上 → 那一列必須完全不動。
run_as "psql -q -d $DB -c \"UPDATE public.user_word_progress
        SET mastery_level = 3, review_count = 3, correct_count = 3
        WHERE word_id = 'lw-interact'\"" >/dev/null
AIRLINE_BEFORE="$(old lw-airline)"
apply_expect_rollback
check "🛑 斷言觸發並回滾"           "$(grep -c '整批回滾' "$TMP/out.txt")" "1"
check "🛑 對不上的那列沒被動到"     "$(old lw-interact)" "3/3"
check "🛑 其他兩列也沒被動（整批退回，不留一半）" "$(old lw-airline)" "$AIRLINE_BEFORE"

echo
echo "🛑 第二次之所以什麼都不會變，是因為 07 把「修改前的數值」寫進 WHERE 當"
echo "   樂觀鎖。若改成像 06 那樣現場重算，airline 會變成 5−1=4，跑幾次扣幾次。"
echo
echo "通過 $PASS 條，失敗 $FAIL 條"
[ "$FAIL" -eq 0 ]
