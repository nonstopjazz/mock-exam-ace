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

/**
 * @param nameQuery 只作用在 A6（依學生查看）。
 *
 * 🛑 姓名條件【不】進 scope：A4 是「哪些錯」、A5 是「誰犯過這個錯」，
 *    用姓名去篩那兩支沒有意義，而且會讓三支的數字對不起來。
 *
 * 🛑 而且它一定要送到伺服器。在前端對 rows 過濾，是在一份
 *    【已經被截斷到 100 位】的資料上搜尋 —— 搜不到的學生會看起來像
 *    「沒有錯誤紀錄」，實際上是沒被撈回來。那比沒有搜尋更危險。
 */
export function useErrorTracking(
  scope: ErrorScope,
  enabled: boolean,
  nameQuery: string | null = null,
) {
  const [data, setData] = useState<TrackingData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // scope 是物件，直接進依賴陣列每次 render 都會變。序列化成字串當 key。
  const scopeKey = JSON.stringify(scope);
  // 空字串與 null 要視為同一件事，否則清空搜尋框會白跑一次。
  const nameKey = nameQuery?.trim() ? nameQuery.trim() : "";

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);

    const args = scopeArgs(JSON.parse(scopeKey) as ErrorScope);
    const [overviewRes, studentsRes, studentErrorsRes] = await Promise.all([
      supabase.rpc("writing_admin_error_overview", { ...args, p_limit: 20 }),
      supabase.rpc("writing_admin_error_students", { ...args, p_limit: 200 }),
      supabase.rpc("writing_admin_student_errors", {
        ...args,
        p_student_limit: 100,
        p_name_query: nameKey === "" ? null : nameKey,
      }),
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
  }, [scopeKey, nameKey, enabled]);

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
        // 🛑 必須與清單那一支一致。漏了的話，老師在「含已離開」狀態下
        //    點開一位已離開學生的錯誤會是空的 ——
        //    清單上有、點開卻沒有，那是最難查的一種不一致。
        p_include_left: args.p_include_left,
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
