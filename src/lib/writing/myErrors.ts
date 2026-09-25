/**
 * 學生看自己的錯誤統計 —— 型別與共用工具。
 *
 * 資料來自兩支 SECURITY DEFINER RPC：
 *   writing_my_error_overview()   總覽（哪些錯、出現在幾篇）
 *   writing_my_error_findings()   某個錯的完整歷史（原文／修正／說明）
 *
 * 🛑 兩支都【沒有 student_id 參數】，對象一律是 auth.uid()。
 *    授權不是靠前端不傳別人的 id，是靠那個參數不存在。
 *
 * 與老師端（errorTracking.ts）的差別，只有兩處：
 *
 *   1. 沒有 student_count。對一個人來說永遠是 1。
 *   2. 排序改成 essay_count 優先。老師版是 student_count DESC
 *      （「多少人需要聽這堂課」），那個數字在學生版沒有意義。
 *
 * 其餘刻意保持一致 —— 同一份資料，學生與老師看到的輕重相同。
 * 特別是【沒有任何「至少出現 N 次」的門檻】：只犯過一次的錯也要列出來。
 */

/** writing_my_error_overview 的一列 */
export interface MyErrorRow {
  error_code: string;
  /** 這個錯出現在我幾篇作文裡 */
  essay_count: number;
  /** 總共幾次 */
  occurrence_count: number;
  is_fallback_code: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface MyErrorOverview {
  rows: MyErrorRow[];
  total: number;
  limit: number;
  truncated: boolean;
  /** 我有幾篇作文出現過錯誤 —— 讓「4 篇」這個數字有分母 */
  essay_total: number;
}

/** writing_my_error_findings 的一列。形狀與老師版的 A7 相同。 */
export interface MyErrorFinding {
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

export interface MyErrorFindings {
  rows: MyErrorFinding[];
  total: number;
  limit: number;
  truncated: boolean;
}

export const EMPTY_OVERVIEW: MyErrorOverview = {
  rows: [],
  total: 0,
  limit: 20,
  truncated: false,
  essay_total: 0,
};
