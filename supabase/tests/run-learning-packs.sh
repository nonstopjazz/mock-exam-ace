#!/usr/bin/env bash
#
# 主題學習包（第一期）的資料層測試。
#
#   bash supabase/tests/run-learning-packs.sh
#
# 🛑 只對本機 postgres 使用。會 createdb / dropdb，不連任何真實環境。
#
# ⚠️ packs 與 pack_items 【沒有 migration】—— 它們早於 migrations 資料夾
#    （由 Supabase UI 建立）。所以這裡造最小替身。欄位取自 PacksAdmin.tsx
#    實際讀寫的那幾個。真實環境的欄位更多，但學習包只用到 id / title。
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="${DB:-lp_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }
cleanup() { [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_as "createdb $DB"
chmod -R a+rX supabase 2>/dev/null || true

FILES=(
  supabase/tests/_local_harness.sql
  supabase/migrations/create_user_profiles_table.sql
  supabase/migrations/create_learn_classes_tasks.sql
  supabase/migrations/create_reading_passages.sql
  supabase/migrations/create_reading_questions.sql
)

for f in "${FILES[@]}"; do
  if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/$f'" > /tmp/lp-step.log 2>&1; then
    echo "❌ $f"; tail -20 /tmp/lp-step.log; exit 1
  fi
done
echo "✅ 前置 migration"

# packs / pack_items 的最小替身（見檔頭）
run_as "psql -q -v ON_ERROR_STOP=1 -d $DB" <<'STUB'
CREATE TABLE IF NOT EXISTS packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  definition TEXT,
  sort_order INTEGER
);
STUB
echo "✅ packs / pack_items 替身"

for f in supabase/migrations/create_learning_packs_1_tables.sql \
         supabase/migrations/create_learning_packs_2_admin.sql; do
  if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/$f'" > /tmp/lp-step.log 2>&1; then
    echo "❌ $(basename "$f")"; tail -25 /tmp/lp-step.log; exit 1
  fi
  echo "✅ $(basename "$f")"
done

echo
if run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/supabase/tests/learning_packs_admin_test.sql'" \
     > /tmp/lp-test.log 2>&1; then
  PASS=$(grep -c "PASS" /tmp/lp-test.log || true)
  echo "✅ 全部通過（$PASS 條）"
  echo "──── 關鍵斷言 ────"
  grep -E "PASS  🛑" /tmp/lp-test.log | sed -E 's/^psql:[^ ]+ NOTICE:  //' | head -20
  exit 0
else
  echo "❌ 有未通過的："
  grep -E "FAIL|ERROR" /tmp/lp-test.log | sed -E 's/^psql:[^ ]+ //' | head -10
  echo "（完整輸出：/tmp/lp-test.log）"
  exit 1
fi
