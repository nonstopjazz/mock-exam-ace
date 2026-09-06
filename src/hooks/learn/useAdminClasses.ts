import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AdminClassSummary } from "@/lib/learn/tasks";

/**
 * 班級清單（老師端）。
 * 授權在資料庫層：learn_admin_classes() 對非管理員直接 raise 42501，
 * 不是靠前端藏按鈕。
 */
export function useAdminClasses(includeArchived = false) {
  const [classes, setClasses] = useState<AdminClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("learn_admin_classes", {
      p_include_archived: includeArchived,
    });
    if (rpcError) {
      setError(rpcError.message);
      setClasses([]);
    } else {
      setClasses((data as unknown as AdminClassSummary[]) ?? []);
    }
    setLoading(false);
  }, [includeArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const createClass = useCallback(
    async (name: string, nextClassDate: string | null) => {
      const { data, error: rpcError } = await supabase.rpc("learn_admin_upsert_class", {
        p_class_id: null,
        p_name: name,
        p_next_class_date: nextClassDate,
        p_note: null,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const, id: (data as { id: string }).id };
    },
    [load],
  );

  const archiveClass = useCallback(
    async (classId: string, archived: boolean) => {
      const { error: rpcError } = await supabase.rpc("learn_admin_archive_class", {
        p_class_id: classId,
        p_archived: archived,
      });
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const };
    },
    [load],
  );

  return { classes, loading, error, reload: load, createClass, archiveClass };
}
