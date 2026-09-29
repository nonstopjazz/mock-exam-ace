import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CourseDetail, CourseSummary, LessonPlayback } from "@/lib/learn/course/types";

/**
 * 影片課程的三支 hook。
 *
 * 🛑 全部走 RPC，不直接查表。learn_course_* 那幾張表對 authenticated
 *    一條 policy 都沒有，直接 select 會回空陣列而不是錯誤——那種失敗
 *    最難查，所以這裡連試都不要試。
 *
 * 🛑 supabase.rpc() 不會 throw，它 resolve 成 { data, error }。
 *    忘了看 error 的話，畫面會停在「載入中」而 console 一片乾淨。
 */

export function useCourses() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("learn_course_list");
    if (rpcError) {
      setError(rpcError.message);
      setCourses([]);
    } else {
      setCourses((data as CourseSummary[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { courses, loading, error, reload: load };
}

/**
 * @param asStudent 管理員切到「以學生身分預覽」時傳 true。
 *   🛑 這個參數只會【減少】權限。學生傳什麼都一樣，後端不會因此多給。
 */
export function useCourseDetail(courseId: string | undefined, asStudent = false) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .rpc("learn_course_detail", { p_course_id: courseId, p_as_student: asStudent });
    if (rpcError) {
      setError(rpcError.message);
      setDetail(null);
    } else {
      setDetail(data as CourseDetail);
    }
    setLoading(false);
  }, [courseId, asStudent]);

  useEffect(() => { void load(); }, [load]);

  return { detail, loading, error, reload: load };
}

/**
 * 取一支影片的播放位址。
 *
 * 🛑 每次要播都重新呼叫，不要快取。Bunny 的網址帶簽章而且會過期，
 *    快取起來的結果是學生看到一半畫面變成 403。
 */
export function useLessonPlayback() {
  const [playback, setPlayback] = useState<LessonPlayback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (lessonId: string, asStudent = false) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .rpc("learn_course_playback", { p_lesson_id: lessonId, p_as_student: asStudent });
    if (rpcError) {
      // 後端刻意把「沒權限」與「不存在」講成同一句話，這裡照實顯示
      setError(rpcError.message);
      setPlayback(null);
    } else {
      setPlayback(data as LessonPlayback);
    }
    setLoading(false);
    return !rpcError;
  }, []);

  const close = useCallback(() => { setPlayback(null); setError(null); }, []);

  return { playback, loading, error, open, close };
}

export interface ProgressResult {
  ok: boolean;
  /** 伺服器判定的完成狀態。達到觀看門檻時會自己變 true */
  completed: boolean;
  watchedSeconds: number;
  thresholdSeconds: number;
}

/**
 * 回報進度。
 *
 * 🛑 這支不擋 UI：進度回報失敗不該讓學生看不了影片。
 *    但 error 仍然要被讀掉，否則是一個沒人處理的 rejected promise。
 *
 * 🛑 完成【由伺服器決定】。前端送上去的是「看了幾秒」，
 *    夠不夠是那邊算的——門檻改了不用改前端，而且前端說了不算。
 */
export async function reportLessonProgress(
  lessonId: string,
  positionSeconds: number | null,
  completed: boolean,
  watchedSeconds: number | null = null,
): Promise<ProgressResult> {
  const { data, error } = await supabase.rpc("learn_lesson_progress_set", {
    p_lesson_id: lessonId,
    p_position_seconds: positionSeconds,
    p_completed: completed,
    p_watched_seconds: watchedSeconds,
  });
  if (error) {
    return { ok: false, completed: false, watchedSeconds: 0, thresholdSeconds: 0 };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    completed: row.completed === true,
    watchedSeconds: Number(row.watched_seconds ?? 0),
    thresholdSeconds: Number(row.threshold_seconds ?? 0),
  };
}
