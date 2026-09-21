import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  scopeArgs,
  type ErrorFindingsResult,
  type ErrorOverviewResult,
  type ErrorScope,
  type ErrorStudentsResult,
  type StudentErrorsResult,
} from "@/lib/writing/errorTracking";

/**
 * 錯誤追蹤的資料讀取。
 *
 * 三支總覽查詢（A4/A5/A6）一起載入，因為它們共用同一個 scope，
 * 分開載入會讓畫面上三個數字在不同時間點跳動。
 *
 * drill-down（A7）是點開才載入 —— 那是逐筆原文，量比較大，
 * 而且老師一次只會看一個學生的一種錯。
 */

interface TrackingData {
  overview: ErrorOverviewResult | null;
  students: ErrorStudentsResult | null;
  studentErrors: StudentErrorsResult | null;
}

const EMPTY: TrackingData = { overview: null, students: null, studentErrors: null };

export function useErrorTracking(scope: ErrorScope, enabled: boolean) {
  const [data, setData] = useState<TrackingData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // scope 是物件，直接進依賴陣列每次 render 都會變。序列化成字串當 key。
  const scopeKey = JSON.stringify(scope);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    const args = scopeArgs(JSON.parse(scopeKey) as ErrorScope);
    const [overviewRes, studentsRes, studentErrorsRes] = await Promise.all([
      supabase.rpc("writing_admin_error_overview", { ...args, p_limit: 20 }),
      supabase.rpc("writing_admin_error_students", { ...args, p_limit: 200 }),
      supabase.rpc("writing_admin_student_errors", { ...args, p_student_limit: 100 }),
    ]);

    // 三支任何一支失敗都要講出來。靜默少顯示一區，老師會以為「沒有資料」。
    const firstError =
      overviewRes.error?.message ??
      studentsRes.error?.message ??
      studentErrorsRes.error?.message ??
      null;

    if (firstError) {
      setError(firstError);
      setData(EMPTY);
    } else {
      setData({
        overview: overviewRes.data as unknown as ErrorOverviewResult,
        students: studentsRes.data as unknown as ErrorStudentsResult,
        studentErrors: studentErrorsRes.data as unknown as StudentErrorsResult,
      });
    }
    setLoading(false);
  }, [scopeKey, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...data, loading, error, reload: load };
}

/** A7 drill-down：點開某位學生的某個錯才載入 */
export function useErrorFindings() {
  const [rows, setRows] = useState<Record<string, ErrorFindingsResult>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(
    async (scope: ErrorScope, studentId: string, errorCode: string) => {
      const key = `${studentId}:${errorCode}`;
      if (rows[key] || loadingKey === key) return;

      setLoadingKey(key);
      const args = scopeArgs(scope);
      const { data, error } = await supabase.rpc("writing_admin_error_findings", {
        p_student_id: studentId,
        p_error_code: errorCode,
        p_class_id: args.p_class_id,
        p_from: args.p_from,
        p_to: args.p_to,
        p_topic: args.p_topic,
        p_limit: 50,
      });

      if (error) {
        setErrors((prev) => ({ ...prev, [key]: error.message }));
      } else {
        setRows((prev) => ({ ...prev, [key]: data as unknown as ErrorFindingsResult }));
      }
      setLoadingKey(null);
    },
    [rows, loadingKey],
  );

  return { rows, errors, loadingKey, load };
}
