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

export function useCourseDetail(courseId: string | undefined) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .rpc("learn_course_detail", { p_course_id: courseId });
    if (rpcError) {
      setError(rpcError.message);
      setDetail(null);
    } else {
      setDetail(data as CourseDetail);
    }
    setLoading(false);
  }, [courseId]);

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

  const open = useCallback(async (lessonId: string) => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase
      .rpc("learn_course_playback", { p_lesson_id: lessonId });
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

/**
 * 回報進度。
 *
 * 🛑 這支不管回傳值也不擋 UI：進度回報失敗不該讓學生看不了影片。
 *    但 error 仍然要被讀掉，否則是一個沒人處理的 rejected promise。
 */
export async function reportLessonProgress(
  lessonId: string,
  positionSeconds: number | null,
  completed: boolean,
): Promise<boolean> {
  const { error } = await supabase.rpc("learn_lesson_progress_set", {
    p_lesson_id: lessonId,
    p_position_seconds: positionSeconds,
    p_completed: completed,
  });
  return !error;
}
