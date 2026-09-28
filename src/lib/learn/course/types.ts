/**
 * 影片課程的型別。與 learn_course_* RPC 的回傳一一對應。
 *
 * 🛑 這裡【沒有】video_id，而且不該有。後端的 learn_course_detail() 刻意
 *    不回傳它——加一個 optional 的 videoId 進來，下一個人就會以為它有值，
 *    然後寫出一個在正式環境永遠是 undefined 的播放器。
 *    影片位址只從 learn_course_playback() 來，型別是 LessonPlayback。
 */

export type CourseType = "STANDARD" | "DRIP";
export type CourseAccess = "FREE" | "ENROLLED";
export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type CourseLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type VideoProvider = "BUNNY" | "YOUTUBE";

/** learn_course_list() 的一列 */
export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructor: string;
  cover_path: string | null;
  level: CourseLevel;
  category: string;
  type: CourseType;
  access: CourseAccess;
  status: CourseStatus;
  lesson_count: number;
  completed_count: number;
  duration_seconds: number;
}

/** learn_course_detail() 裡的一支影片。注意沒有位址。 */
export interface CourseLesson {
  id: string;
  position: number;
  title: string;
  description: string;
  duration_seconds: number;
  is_preview: boolean;
  completed: boolean;
  last_position_seconds: number;
}

export interface CourseSection {
  id: string;
  position: number;
  title: string;
  description: string;
  /** 🛑 後端算的。前端不重算，否則兩邊會慢慢漂開。 */
  locked: boolean;
  lessons: CourseLesson[];
}

export interface CourseDetail {
  course: Omit<CourseSummary, "lesson_count" | "completed_count" | "duration_seconds">;
  sections: CourseSection[];
}

/** learn_course_playback() —— 唯一帶得出播放位址的地方 */
export interface LessonPlayback {
  lesson_id: string;
  title: string;
  description: string;
  provider: VideoProvider;
  duration_seconds: number;
  last_position_seconds: number;
  embed_url: string;
  /** Bunny 的簽章有效期；YouTube 是 null */
  expires_at: string | null;
}
