/**
 * 影片課程的純計算。沒有 React、沒有 supabase，所以規則可以直接測。
 *
 * 現有樣板把時長存成 "15:30" 這種字串。字串沒辦法加總、排序是字典序
 * （"9:00" 會排在 "15:30" 後面），所以資料庫存的是秒數，格式化在這裡做。
 */
import type { CourseSection, CourseSummary, CourseType } from "./types";

/** 90 → "1:30"；3661 → "1:01:01"。用在影片列表那種要對齊的地方。 */
export function formatDuration(seconds: number): string {
  // 🛑 NaN / 負數 / 非整數都要有定義。播放器回報的秒數是浮點數。
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * 長度還沒填時顯示「—」，不是 0:00。
 *
 * 🛑 0:00 是一個看起來像真的的假數字。學生會以為那是一支空影片，
 *    管理員則不會發現有東西沒填。
 */
export const formatDurationOrDash = (seconds: number): string =>
  Number.isFinite(seconds) && seconds > 0 ? formatDuration(seconds) : "—";

/** 16200 → "4 小時 30 分"。用在課程卡片那種給人讀的地方。 */
export function formatDurationLong(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (s < 60) return `${s} 秒`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  // 59 分 40 秒會被四捨五入成 60 分，那要進位成 1 小時，不是「0 小時 60 分」
  if (m === 60) return `${h + 1} 小時`;
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

/**
 * 完成百分比。
 *
 * 🛑 一支影片都還沒有的課要回 0，不是 NaN。(0/0)*100 是 NaN，
 *    傳進 Progress 之後不會報錯，只會畫出一條空白或滿格的怪東西。
 */
export function progressPercent(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const done = Number.isFinite(completed) ? Math.max(0, completed) : 0;
  return Math.min(100, Math.round((done / total) * 100));
}

/** 週次課叫「第 N 週」，循序課叫「單元 N」。只是標籤，資料結構是同一個。 */
export function sectionLabel(type: CourseType, position: number): string {
  return type === "DRIP" ? `單元 ${position}` : `第 ${position} 週`;
}

export const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "初級",
  INTERMEDIATE: "中級",
  ADVANCED: "高級",
};

/** 六大能力卡用的色票對應，與站上既有的 level badge 一致 */
export const LEVEL_BADGE: Record<string, string> = {
  BEGINNER: "bg-success/10 text-success border-success/20",
  INTERMEDIATE: "bg-warning/10 text-warning border-warning/20",
  ADVANCED: "bg-destructive/10 text-destructive border-destructive/20",
};

export interface NextLesson {
  sectionId: string;
  sectionPosition: number;
  lessonId: string;
  title: string;
}

/**
 * 「繼續上課」要跳到哪一支：第一支【沒看完而且沒鎖住】的。
 *
 * 🛑 鎖住的段落要跳過，不是停在那裡。循序課的學生按「繼續上課」跳到一個
 *    按了會報錯的單元，比沒有這顆按鈕更糟。
 *
 * 全部看完回 null——畫面該顯示的是「已完成」，不是再指一支影片。
 */
export function nextLesson(sections: CourseSection[]): NextLesson | null {
  for (const s of [...sections].sort((a, b) => a.position - b.position)) {
    if (s.locked) continue;
    for (const l of [...s.lessons].sort((a, b) => a.position - b.position)) {
      if (!l.completed) {
        return { sectionId: s.id, sectionPosition: s.position, lessonId: l.id, title: l.title };
      }
    }
  }
  return null;
}

/** 大綱算出來的總數，用在詳細頁（清單頁的數字是後端給的） */
export function countLessons(sections: CourseSection[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const s of sections) {
    for (const l of s.lessons) {
      total++;
      if (l.completed) done++;
    }
  }
  return { total, done };
}

/** 清單頁的排序：還沒開始的排前面，已完成的沉底 */
export function sortForStudent(courses: CourseSummary[]): CourseSummary[] {
  const rank = (c: CourseSummary) => {
    const pct = progressPercent(c.completed_count, c.lesson_count);
    if (pct === 100) return 2;   // 完成的沉底
    if (pct > 0) return 0;       // 進行中的最前面
    return 1;                    // 還沒開始的居中
  };
  return [...courses].sort((a, b) => rank(a) - rank(b));
}
