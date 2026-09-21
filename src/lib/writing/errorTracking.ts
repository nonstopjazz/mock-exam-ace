/**
 * 錯誤追蹤（Phase 1A）的型別與共用工具。
 *
 * 資料全部來自四支 SECURITY DEFINER RPC，授權在資料庫層（is_admin），
 * 不是靠前端藏按鈕。
 *
 * 🛑 這裡沒有任何「至少出現 N 次」的門檻，也不該加。
 *    老師的需求是「不要漏掉某個學生曾經犯過哪些值得 follow-up 的錯」——
 *    production 實測就有兩位學生是 1 篇作文 / 1 個 finding，
 *    而那正是最容易漏掉、最想被提醒的情況。
 */

/** 四支 RPC 共用的篩選範圍。四支吃同一組參數，數字才對得起來。 */
export interface ErrorScope {
  /** 班級 id。null = 所有班級。語意是 S1「目前在籍」 */
  classId: string | null;
  /** 起（含）。null = 不限 */
  from: string | null;
  /** 迄（不含）。null = 不限 */
  to: string | null;
  topic: string | null;
  /** 多個 code 的語意是 OR。空陣列 = 不限 */
  codes: string[];
}

export const EMPTY_SCOPE: ErrorScope = {
  classId: null,
  from: null,
  to: null,
  topic: null,
  codes: [],
};

/** RPC 共用的回傳外殼：被截斷的清單不會看起來像完整的 */
interface Envelope {
  total?: number;
  limit?: number;
  truncated?: boolean;
}

/** A4 Common Errors */
export interface ErrorOverviewRow {
  error_code: string;
  student_count: number;
  essay_count: number;
  occurrence_count: number;
  is_fallback_code: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
}
export interface ErrorOverviewResult extends Envelope {
  rows: ErrorOverviewRow[];
}

/** A5 Error → Students */
export interface ErrorStudentRow {
  student_id: string;
  student_name: string | null;
  essay_count: number;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  matched_codes: string[];
}
export interface ErrorStudentsResult extends Envelope {
  rows: ErrorStudentRow[];
}

/** A6 Student → Errors（D8 = S-b） */
export interface StudentErrorRow {
  student_id: string;
  student_name: string | null;
  error_code: string;
  essay_count: number;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  is_fallback_code: boolean;
  /** 老師這次在篩選裡選中的 code */
  is_selected: boolean;
}
export interface StudentErrorsResult {
  rows: StudentErrorRow[];
  student_total?: number;
  student_limit?: number;
  truncated?: boolean;
}

/** A7 Drill-down */
export interface ErrorFindingRow {
  finding_id: string;
  essay_id: string;
  essay_submitted_at: string | null;
  essay_topic: string | null;
  finding_index: number;
  error_code: string;
  primary_skill: string | null;
  quote: string;
  correction: string;
  reason: string;
  is_fallback_code: boolean;
}
export interface ErrorFindingsResult extends Envelope {
  rows: ErrorFindingRow[];
}

/** 把 scope 轉成 RPC 參數。四支共用，避免各自拼出略有不同的參數 */
export function scopeArgs(scope: ErrorScope): Record<string, unknown> {
  return {
    p_class_id: scope.classId,
    p_from: scope.from,
    p_to: scope.to,
    p_topic: scope.topic,
    p_error_codes: scope.codes.length > 0 ? scope.codes : null,
  };
}

/**
 * 依「幾篇作文出現」推出的嚴重度色調。
 *
 * ⚠️ 這只是【呈現上的輕重】，不是任何判定。
 *    Phase 1A 沒有 REPEATED / PERSISTENT 這種狀態，也刻意不做
 *    —— coverage count = 0 不代表精熟（TR-12／TR-13），
 *    同理「只出現一次」也不代表不重要。
 */
export function essayCountTone(essayCount: number): string {
  if (essayCount >= 3) return "border-accent/40 text-accent";
  if (essayCount === 2) return "border-primary/40 text-primary";
  return "border-border text-muted-foreground";
}
