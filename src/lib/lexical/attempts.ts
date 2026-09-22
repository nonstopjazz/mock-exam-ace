import { supabase } from "@/lib/supabase";
import { useVocabularyStore } from "@/store/vocabularyStore";
import {
  recordAttemptResultSchema,
  type ExerciseType,
  type RecordAttemptResult,
  type SelfRating,
  type SkillDimension,
} from "./types";
import { legacyIdentity } from "./mapper";

/**
 * Lexical Model Phase 6 —— 七個 practice 頁面唯一的作答寫入口。
 *
 * 在這之前，每個頁面自己呼叫 `store.updateWordProgress(...)`，
 * 而且每一次作答的細節（花了幾秒、拼錯幾次、有沒有看提示）全部丟掉。
 *
 * 現在頁面的責任縮成四件事：
 *   1. 顯示題目
 *   2. 判定作答結果
 *   3. 記錄 attempt        ← 這裡
 *   4. 呼叫相容 mastery 更新 ← 也是這裡
 *
 * ⚠️ 本次沒有新的 mastery / SRS 演算法。
 *    熟練度仍然由既有的 `updateWordProgress()` 用原本的公式維護
 *    （寫進 user_word_progress），資料庫端的
 *    `record_lexical_attempt()` 用完全相同的公式平行維護
 *    student_lexical_mastery。兩套並存是刻意的相容策略。
 */

export interface PracticeAttemptInput {
  /** legacy id：level_words.id 或 pack_items.id。 */
  wordId: string;
  /** 這一輪練習選的來源。決定 legacy id 要往哪張對照表查。 */
  source: "level" | "pack";
  packId?: string | null;

  exerciseType: ExerciseType;
  skillDimension: SkillDimension;

  /**
   * 客觀對錯。`null` / 省略 = 這一次沒有客觀對錯
   * （翻卡曝光、SRS 自評都屬於這一類，不該被當成答對）。
   */
  correct?: boolean | null;

  responseTimeMs?: number | null;
  attemptCount?: number | null;
  usedHint?: boolean | null;
  selfRating?: SelfRating | null;

  sessionId?: string | null;
  assignmentId?: string | null;
  metadata?: Record<string, unknown> | null;

  /**
   * 傳給【舊】`updateWordProgress()` 的 isCorrect，用來逐位元保留改版前的行為。
   *
   * 為什麼需要這個：舊的 Flashcards「Mark as Known」與 SRS 的 hard/easy
   * 都傳 `isCorrect = true`，所以 user_word_progress.correct_count 會 +1。
   * 新的 attempt 表把它們記成 `correct = null`（自評不是客觀測驗證據）。
   * 若不分開，這次改版會悄悄改掉舊表的 correct_count ——
   * 那就不是相容層了。
   *
   * 省略時預設 `correct === true`。
   */
  legacyCorrect?: boolean;

  /**
   * 這一次要不要動熟練度。預設 true。
   *
   * false 用於「留證據但不評分」的情況：
   *   - 配對遊戲的誤點（規格明講 attempt history 與 mastery update 要分離）
   *   - 翻卡曝光（只是看過，不是測驗）
   */
  applyMastery?: boolean;
}

/** 前端這一輪練習的識別碼，讓同一場的 attempt 可以被歸在一起。 */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * 只送 attempt，不動熟練度。
 *
 * 失敗一律吞掉：練習頁面不能因為記錄失敗就中斷學生的作答。
 * 這與既有 `syncWordProgress()` 的 fire-and-forget 作風一致。
 */
async function sendAttempt(input: PracticeAttemptInput): Promise<RecordAttemptResult | null> {
  const { legacySource, legacyId } = legacyIdentity({ id: input.wordId }, input.source);

  try {
    const { data, error } = await supabase.rpc("record_lexical_attempt", {
      p_exercise_type: input.exerciseType,
      p_skill_dimension: input.skillDimension,
      p_legacy_source: legacySource,
      p_legacy_id: legacyId,
      p_correct: input.correct ?? null,
      p_response_time_ms: input.responseTimeMs ?? null,
      p_attempt_count: input.attemptCount ?? null,
      p_used_hint: input.usedHint ?? null,
      p_self_rating: input.selfRating ?? null,
      p_pack_id: input.source === "pack" ? (input.packId ?? null) : null,
      p_assignment_id: input.assignmentId ?? null,
      p_session_id: input.sessionId ?? null,
      p_metadata: input.metadata ?? null,
      p_apply_mastery: input.applyMastery !== false,
    });

    if (error) {
      // 包含 migration 還沒跑、函式不存在的情況 —— 舊的進度路徑不受影響。
      console.error("[lexical] record_lexical_attempt 失敗:", error.message);
      return null;
    }

    const parsed = recordAttemptResultSchema.safeParse(data);
    if (!parsed.success) {
      console.error("[lexical] record_lexical_attempt 回傳格式不符", parsed.error.issues);
      return null;
    }
    if (!parsed.data.recorded && parsed.data.reason === "UNMAPPED") {
      // 這個 legacy id 還沒對應到 canonical item（例如 manual_review_required
      // 的 pack item）。這不是錯誤，是 migration report 上待處理的項目。
      console.warn(`[lexical] ${legacySource}:${legacyId} 尚未對應到 canonical item`);
    }
    return parsed.data;
  } catch (err) {
    console.error("[lexical] record_lexical_attempt 例外:", err);
    return null;
  }
}

/**
 * 相容 mastery 更新器。
 *
 * 就是既有的 `vocabularyStore.updateWordProgress()`，一個字都沒改。
 * 包一層只是為了讓「頁面不再自己決定熟練度」這件事在結構上看得出來。
 */
function applyCompatMastery(input: PracticeAttemptInput): void {
  const store = useVocabularyStore.getState();
  const isCorrect = input.legacyCorrect ?? input.correct === true;

  if (input.source === "pack" && input.packId) {
    store.updateWordProgress(input.wordId, isCorrect, input.selfRating ?? undefined, "pack", input.packId);
  } else {
    store.updateWordProgress(input.wordId, isCorrect, input.selfRating ?? undefined, "level");
  }
}

/**
 * 記錄一次作答。
 *
 * 呼叫順序刻意是「先舊後新」：
 *   1. 相容 mastery 更新（同步，直接改 React state）—— 畫面的反應時機與改版前一模一樣
 *   2. attempt 寫入（非同步，fire-and-forget）
 *
 * 所以就算新的 RPC 整個壞掉、或 migration 還沒跑，七個頁面的行為
 * 與改版前完全相同。
 */
export function recordPracticeAttempt(input: PracticeAttemptInput): void {
  if (input.applyMastery !== false) {
    applyCompatMastery(input);
  }
  void sendAttempt(input);
}

/**
 * 只留證據、不評分。
 *
 * 用於配對誤點與翻卡曝光 —— 這兩件事在改版前【完全不寫入任何東西】，
 * 現在會留下 attempt，但一樣不碰熟練度。
 */
export function recordEvidenceOnly(
  input: Omit<PracticeAttemptInput, "applyMastery">,
): void {
  void sendAttempt({ ...input, applyMastery: false });
}
