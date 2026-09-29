#!/usr/bin/env bash
#
# 從零建一個臨時資料庫，把影片課程的 migration 依序跑完，再跑測試。
#
#   bash supabase/tests/run-learn-courses.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#
# 順序是有意義的：
#   user_profiles      → learn_classes_tasks 需要它來解析顯示名稱
#   learn_classes_tasks→ learn_require_admin() 在這裡
#   learn_feature_access→ learn_feature_enabled()，課程的第一層閘門
#   fix_class_membership_left_at → 退出班級的人不該繼續有權限
#   learn_courses 三份 → 表 → 讀取 RPC → 播放
#
# ⚠️ _local_harness.sql 要在 user_profiles 【之前】載：後者會用真版的
#    is_admin() 覆蓋替身。測試檔自己會再覆蓋一次，所以順序其實不影響
#    結果——這一行只是說明為什麼它排在這裡。
set -euo pipefail

cd "$(dirname "$0")/../.."
DB="${DB:-learncourses_$$}"
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }

cleanup() { [ "${KEEP_DB:-0}" = "1" ] || run_as "dropdb --if-exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

run_as "createdb $DB"

FILES=(
  supabase/tests/_local_harness.sql
  supabase/migrations/create_user_profiles_table.sql
  supabase/migrations/create_learn_classes_tasks.sql
  supabase/migrations/create_learn_feature_access.sql
  supabase/migrations/fix_class_membership_left_at.sql
  supabase/migrations/create_learn_courses.sql
  supabase/migrations/create_learn_course_rpcs.sql
  supabase/migrations/create_learn_course_playback.sql
  supabase/migrations/create_learn_course_admin.sql
  supabase/migrations/add_learn_lesson_watch_tracking.sql
  supabase/migrations/add_learn_lesson_duration_autofill.sql
)

for f in "${FILES[@]}"; do
  if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/$f'" > /tmp/lc-step.log 2>&1; then
    echo "❌ $f"; tail -20 /tmp/lc-step.log; exit 1
  fi
  echo "✅ $(basename "$f")"
done

echo
for t in learn_course_access_test learn_course_admin_test learn_watch_tracking_test learn_lesson_duration_test; do
  echo "──────── $t ────────"
  run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/supabase/tests/$t.sql'" 2>&1 \
    | sed -E 's/^psql:[^ ]+ NOTICE:  //'
done
