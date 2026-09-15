import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FeatureAccess } from "@/lib/speaking/types";

/**
 * 管理端：某個功能開放給誰。
 *
 * 授權在資料庫層：learn_admin_feature_access() 對非管理員直接 raise 42501。
 *
 * 每次改完都重新載入整份，不在前端自己更新狀態。原因是 reach（實際看得到的
 * 人數）要去重，班級與個別授權會重疊——在前端算一次、資料庫算一次，
 * 遲早會有一邊算錯，而畫面上那個數字正是管理員唯一會相信的東西。
 */
export function useFeatureAccess(feature: string) {
  const [access, setAccess] = useState<FeatureAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("learn_admin_feature_access", {
      p_feature: feature,
    });
    if (rpcError) {
      setError(rpcError.message);
      setAccess(null);
    } else {
      setAccess(data as unknown as FeatureAccess);
    }
    setLoading(false);
  }, [feature]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 開放或收回。target 只能二選一，與資料庫的 CHECK 一致。 */
  const setAccessFor = useCallback(
    async (
      target: { classId: string; studentId?: never } | { studentId: string; classId?: never },
      granted: boolean,
      note?: string,
    ) => {
      const key = "classId" in target && target.classId ? target.classId : target.studentId!;
      setSaving(key);
      const { error: rpcError } = await supabase.rpc("learn_admin_set_feature_access", {
        p_feature: feature,
        p_class_id: "classId" in target ? target.classId ?? null : null,
        p_student_id: "studentId" in target ? target.studentId ?? null : null,
        p_granted: granted,
        p_note: note ?? null,
      });
      setSaving(null);
      if (rpcError) return { ok: false as const, error: rpcError.message };
      await load();
      return { ok: true as const };
    },
    [feature, load],
  );

  return { access, loading, error, saving, refetch: load, setAccessFor };
}
