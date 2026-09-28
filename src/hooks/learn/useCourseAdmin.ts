import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { CourseSummary, VideoProvider } from "@/lib/learn/course/types";

/**
 * 管理端的課程 hook。
 *
 * 🛑 這裡的 learn_admin_course_get() 是【唯一】會帶 video_id 回來的讀取。
 *    它在後端第一行就 learn_require_admin()。學生端那支 learn_course_detail()
 *    仍然不回傳——不要為了省事在學生頁面改用這支。
 */

export interface AdminLesson {
  /** 新增的還沒有 id */
  id?: string;
  title: string;
  description: string;
  provider: VideoProvider;
  video_id: string;
  duration_seconds: number;
  is_preview: boolean;
  /** 後端算的：幾個人已經看完。刪之前要看得到代價。 */
  completed_by?: number;
}

export interface AdminSection {
  id?: string;
  title: string;
  description: string;
  lessons: AdminLesson[];
}

export interface AdminCourse {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructor: string;
  cover_path: string | null;
  level: string;
  category: string;
  type: string;
  access: string;
  status: string;
  sort_order: number;
  require_watch: boolean;
}

export interface CourseAccessRow {
  class_id?: string;
  student_id?: string;
  name: string;
  member_count?: number;
  granted?: boolean;
  granted_at?: string;
  note?: string | null;
}

export interface CourseAccessState {
  course_id: string;
  access: string;
  classes: CourseAccessRow[];
  students: CourseAccessRow[];
  reach: number;
}

export interface CourseConfig {
  bunny_library_id: string | null;
  bunny_token_ttl_seconds: number;
  bunny_token_required: boolean;
  /** 🛑 只有布林。金鑰本身不會離開資料庫。 */
  vault_key_present: boolean;
  bunny_lesson_count: number;
}

/** 管理端的課程清單。沿用 learn_course_list()——管理員本來就看得到草稿。 */
export function useAdminCourses() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("learn_course_list");
    if (rpcError) { setError(rpcError.message); setCourses([]); }
    else { setError(null); setCourses((data as CourseSummary[]) ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { courses, loading, error, reload: load };
}

export function useAdminCourse(courseId: string | undefined) {
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: rpcError } = await supabase
      .rpc("learn_admin_course_get", { p_course_id: courseId });
    if (rpcError) { setError(rpcError.message); setCourse(null); setSections([]); }
    else {
      setError(null);
      const payload = data as { course: AdminCourse; sections: AdminSection[] };
      setCourse(payload.course);
      setSections(payload.sections ?? []);
    }
    setLoading(false);
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);
  return { course, sections, setSections, loading, error, reload: load };
}

/** 存課程本身。沒有 id 就是新建，回傳新的那一門。 */
export async function saveCourse(course: Partial<AdminCourse>):
  Promise<{ ok: true; course: AdminCourse } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc("learn_admin_course_save", { p_course: course });
  if (error) return { ok: false, message: error.message };
  return { ok: true, course: data as AdminCourse };
}

/**
 * 存整份大綱。
 *
 * 🛑 後端會拒絕刪掉已經有人看完的影片，錯誤訊息裡有片名與人數。
 *    那個訊息要【原封不動】顯示給管理員——它解釋了為什麼不能刪。
 */
export async function saveOutline(courseId: string, sections: AdminSection[]):
  Promise<{ ok: true } | { ok: false; message: string }> {
  // completed_by 是後端算出來給畫面看的，不要送回去
  const payload = sections.map((s) => ({
    id: s.id, title: s.title, description: s.description,
    lessons: s.lessons.map((l) => ({
      id: l.id, title: l.title, description: l.description,
      provider: l.provider, video_id: l.video_id,
      duration_seconds: l.duration_seconds, is_preview: l.is_preview,
    })),
  }));
  const { error } = await supabase.rpc("learn_admin_course_outline_save", {
    p_course_id: courseId, p_sections: payload,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export function useCourseAccess(courseId: string | undefined) {
  const [state, setState] = useState<CourseAccessState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    const { data, error: rpcError } = await supabase
      .rpc("learn_admin_course_access", { p_course_id: courseId });
    if (rpcError) setError(rpcError.message);
    else { setError(null); setState(data as CourseAccessState); }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  const set = useCallback(async (
    target: { classId?: string; studentId?: string }, granted: boolean,
  ) => {
    if (!courseId) return false;
    const { data, error: rpcError } = await supabase.rpc("learn_admin_course_access_set", {
      p_course_id: courseId,
      p_class_id: target.classId ?? null,
      p_student_id: target.studentId ?? null,
      p_granted: granted,
    });
    if (rpcError) { setError(rpcError.message); return false; }
    setError(null);
    setState(data as CourseAccessState);
    return true;
  }, [courseId]);

  return { state, error, set, reload: load };
}

export function useCourseConfig() {
  const [config, setConfig] = useState<CourseConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("learn_admin_course_config");
    if (rpcError) setError(rpcError.message);
    else { setError(null); setConfig(data as CourseConfig); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (
    libraryId: string | null, ttl: number | null, required: boolean | null,
  ) => {
    const { data, error: rpcError } = await supabase.rpc("learn_admin_course_config_set", {
      p_library_id: libraryId, p_ttl_seconds: ttl, p_token_required: required,
    });
    if (rpcError) { setError(rpcError.message); return false; }
    setError(null);
    setConfig(data as CourseConfig);
    return true;
  }, []);

  return { config, error, save, reload: load };
}
