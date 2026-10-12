import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  CourseAccessMatrix,
  GrantResult,
  MatrixStudent,
} from "@/lib/learn/courseAccessMatrix";

/**
 * 課程開放矩陣的讀寫。
 *
 * 🛑 勾選之後【不】重新載入整張矩陣。RPC 會回報它做了什麼
 *    （granted / feature_added），所以可以精準地只更新那一格 ——
 *    每按一下就重撈全部，表格會在手指底下閃一次。
 */
export function useCourseAccessMatrix(classId: string | null, query: string) {
  const [data, setData] = useState<CourseAccessMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 正在送出的格子，key 是 `${studentId}:${courseId}` */
  const [pending, setPending] = useState<Set<string>>(new Set());

  // 空字串與 null 要視為同一件事，否則清空搜尋框會白跑一次
  const queryKey = query.trim();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows, error: rpcError } = await supabase.rpc(
      "learn_admin_course_access_matrix",
      {
        p_query: queryKey === "" ? null : queryKey,
        p_class_id: classId,
        p_limit: 50,
      },
    );
    if (rpcError) {
      setError(rpcError.message);
      setData(null);
    } else {
      setError(null);
      setData(rows as unknown as CourseAccessMatrix);
    }
    setLoading(false);
  }, [classId, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = useCallback(
    async (studentId: string, courseId: string, granted: boolean): Promise<GrantResult | null> => {
      const key = `${studentId}:${courseId}`;
      setPending((prev) => new Set(prev).add(key));

      const { data: res, error: rpcError } = await supabase.rpc(
        "learn_admin_course_grant_student",
        { p_course_id: courseId, p_student_id: studentId, p_granted: granted },
      );

      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      if (rpcError) {
        setError(rpcError.message);
        return null;
      }
      setError(null);
      const result = res as unknown as GrantResult;

      // 只動那一格。feature_added 時順便把那位學生的 has_feature 補上 ——
      // 不補的話畫面會繼續說「尚無功能」，而實際上剛剛已經給了。
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          students: prev.students.map((s): MatrixStudent => {
            if (s.student_id !== studentId) return s;
            const cell = s.courses[courseId] ?? { direct: false, via_class: null, free: false };
            return {
              ...s,
              has_feature: s.has_feature || result.feature_added,
              feature_direct: s.feature_direct || result.feature_added,
              courses: { ...s.courses, [courseId]: { ...cell, direct: result.granted } },
            };
          }),
        };
      });
      return result;
    },
    [],
  );

  return { data, loading, error, pending, grant, reload: load };
}
