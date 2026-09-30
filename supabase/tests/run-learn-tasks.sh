#!/usr/bin/env bash
#
# 從零建一個臨時資料庫，把班級／任務的 migration 依序跑完，再跑測試。
#
#   bash supabase/tests/run-learn-tasks.sh
#
# 🛑 只對本機 postgres 使用。它會 createdb / dropdb。
#
# 🛑 learn_task_archive_test.sql 在這之前【沒有任何 runner 在跑】。
#    那支測的是「封存不可以碰到歷史」—— learn_task_assignees.task_id 是
#    ON DELETE CASCADE，哪天有人把封存做成刪除，所有學生的完成紀錄會一起消失。
#    測試存在卻沒人跑，等於沒有。順手收進來。
#
# 🛑 每一支測試各自建一個資料庫。
#    共用一個的話會互相汙染：兩支都用同一個學生 uuid、都建叫「測試班」的班級，
#    先跑的那支留下的 ACTIVE 任務會出現在後跑那支的待辦裡，
#    於是「班級封存後待辦應該是空的」這種斷言會無緣無故地紅。
#    那種失敗看起來像程式壞了，實際上是測試踩到彼此 —— 最浪費時間的一種假警報。
#
# 順序是有意義的：
#   user_profiles        → learn_require_admin() 解析顯示名稱要用
#   learn_classes_tasks  → 班級、任務、指派、每日紀錄，以及學生端的兩支 RPC
#   fix_class_membership_left_at → 退出班級的人不該繼續有權限
#   add_learn_tasks_archived_at  → 封存時間，以及老師端看得到已封存
#   add_learn_student_task_history → 學生端的「已結束的作業」
set -euo pipefail

cd "$(dirname "$0")/../.."
PSQL_USER="${PSQL_USER:-postgres}"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-55432}"

run_as() { su "$PSQL_USER" -c "PGHOST=$PGHOST PGPORT=$PGPORT $1"; }

MIGRATIONS=(
  supabase/tests/_local_harness.sql
  supabase/migrations/create_user_profiles_table.sql
  supabase/migrations/create_learn_classes_tasks.sql
  supabase/migrations/fix_class_membership_left_at.sql
  supabase/migrations/add_learn_tasks_archived_at.sql
  supabase/migrations/add_learn_student_task_history.sql
)

TESTS=(learn_task_archive_test learn_student_task_history_test)

DBS=()
cleanup() {
  [ "${KEEP_DB:-0}" = "1" ] && return
  for d in "${DBS[@]}"; do run_as "dropdb --if-exists $d" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

FAILED=0
for t in "${TESTS[@]}"; do
  DB="${DB_PREFIX:-learntasks}_${t}_$$"
  DBS+=("$DB")
  run_as "createdb $DB"

  for f in "${MIGRATIONS[@]}"; do
    if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/$f'" > /tmp/lt-step.log 2>&1; then
      echo "❌ $t ← $(basename "$f")"; tail -20 /tmp/lt-step.log; exit 1
    fi
  done

  echo "──────── $t ────────"
  if ! run_as "psql -q -v ON_ERROR_STOP=1 -d $DB -f '$PWD/supabase/tests/$t.sql'" 2>&1 \
       | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  //'; then
    FAILED=1
  fi
  echo
done

if [ "$FAILED" -eq 0 ]; then echo "✅ 兩支測試全部通過"; else echo "❌ 有測試未通過"; fi
exit $FAILED
