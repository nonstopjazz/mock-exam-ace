#!/usr/bin/env bash
#
# 從零建一個臨時資料庫，把 lexical Phase 1 的 migration 依序跑完，再跑測試。
#
#   bash supabase/tests/run-lexical-phase1.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#
# 順序是有意義的：migrate_pack_items 必須在 migrate_level_words 之後、
# migrate_relations 之前 —— 關係要等 pack item 都併完才解析得準。
# 詳見 docs/lexical/phase1.md §5。
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="${DB:-lexphase1_$$}"
PSQL_USER="${PSQL_USER:-postgres}"

run_as() { su "$PSQL_USER" -c "$1"; }

cleanup() { [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_as "createdb $DB"

FILES=(
  supabase/tests/_local_harness.sql
  supabase/schema.sql
  supabase/migrations/create_user_profiles_table.sql
  supabase/migrations/create_level_words_table.sql
  supabase/migrations/create_user_word_progress_table.sql
  supabase/migrations/unify_word_progress_tracking.sql
  supabase/migrations/create_user_stats_table.sql
  supabase/migrations/add_audio_to_pack_items.sql
  supabase/migrations/add_premium_memberships.sql
  supabase/migrations/add_site_to_user_pack_claims.sql
  supabase/migrations/create_lexical_core.sql
  supabase/migrations/create_lexical_relations.sql
  supabase/migrations/create_lexical_pack_items.sql
  supabase/migrations/create_lexical_progress.sql
  supabase/migrations/create_lexical_rpcs.sql
  supabase/migrations/migrate_level_words_to_lexical.sql
  supabase/migrations/migrate_pack_items_to_lexical.sql
  supabase/migrations/migrate_lexical_relations_from_arrays.sql
  supabase/migrations/create_lexical_migration_report.sql
  # 對全新環境是 no-op（core 已經是收窄後的版本）。
  # 跑它是為了證明【重複執行不會壞】—— production 是先有舊 core 才補這一支。
  supabase/migrations/restrict_lexical_legacy_map_read.sql
)

for f in "${FILES[@]}"; do
  if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/$f'" > /tmp/lexphase1-step.log 2>&1; then
    echo "✗ $f"
    tail -12 /tmp/lexphase1-step.log
    exit 1
  fi
done
echo "✓ baseline 與 9 支 migration 全部建立完成"

run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/supabase/tests/lexical_phase1_test.sql'" 2>&1 \
  | sed -E 's/^psql:[^ ]+ NOTICE:  //'
