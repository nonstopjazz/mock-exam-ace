import { z } from "zod";

/**
 * Lexical Model Phase 1 —— DB 邊界的型別與執行期驗證。
 *
 * 在這之前，七個 practice 頁面各自用 `as any` 直接相信 Supabase 回來的東西。
 * 這個檔案是唯一的入口：所有從資料庫進到前端的語彙資料都先過這裡的 schema。
 */

/** 第一版五種。與 lexical_items.item_type 的 CHECK 對齊。 */
export const LEXICAL_ITEM_TYPES = [
  "word",
  "phrase",
  "collocation",
  "pattern",
  "expression",
] as const;
export type LexicalItemType = (typeof LEXICAL_ITEM_TYPES)[number];

/** 與 lexical_relations.relation_type 的 CHECK 對齊。 */
export const LEXICAL_RELATION_TYPES = [
  "synonym",
  "antonym",
  "word_family",
  "confusable",
  "phrase_of",
  "pattern_of",
  "related",
] as const;
export type LexicalRelationType = (typeof LEXICAL_RELATION_TYPES)[number];

/**
 * 哪一個練習模式出的題。與 lexical_attempts.exercise_type 的 CHECK 對齊。
 *
 * ⚠️ 這與 SkillDimension 是【兩個不同概念】，不要合併：
 *    exercise_type 是題目長什麼樣子，skill_dimension 是在考什麼能力。
 *    fill_blank 與 quick_quiz 都可以考 meaning；同一個 flashcard
 *    既是曝光也是自評。
 */
export const EXERCISE_TYPES = [
  "srs",
  "quick_quiz",
  "flashcard",
  "spelling",
  "fill_blank",
  "match",
  "synonym_antonym",
  "cluster_recall",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** 這一題在考哪一種能力。與 lexical_attempts.skill_dimension 的 CHECK 對齊。 */
export const SKILL_DIMENSIONS = [
  "meaning", // 認得意思
  "form_recall", // 拼得出來
  "context", // 在句子裡用得對
  "lexical_connection", // 同義／反義／字族的連結
  "self_assessment", // 學生自評，不是客觀測驗
] as const;
export type SkillDimension = (typeof SKILL_DIMENSIONS)[number];

/** SRS 與 flashcard 的自評。與 lexical_attempts.self_rating 的 CHECK 對齊。 */
export const SELF_RATINGS = ["forgot", "hard", "easy"] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];

/** legacy 識別碼的來源。與 lexical_legacy_map.legacy_source 的 CHECK 對齊。 */
export type LegacySource = "level_word" | "pack_item";

/**
 * pack_items 一列的形狀。
 *
 * 只有 id / pack_id / word 是必要的；其餘欄位老師常常留空，
 * 所以一律 nullable，由 mapper 收斂成前端要的非 null 值。
 */
export const packItemRowSchema = z.object({
  id: z.string().min(1),
  pack_id: z.string().min(1),
  word: z.string(),
  definition: z.string().nullable().optional(),
  part_of_speech: z.string().nullable().optional(),
  example_sentence: z.string().nullable().optional(),
  phonetic: z.string().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  audio_url: z.string().nullable().optional(),
  example_audio_url: z.string().nullable().optional(),
});
export type PackItemRow = z.infer<typeof packItemRowSchema>;

/** lexical_items 一列的形狀。Phase 1 前端還沒直接讀，先把契約寫下來。 */
export const lexicalItemRowSchema = z.object({
  id: z.string().uuid(),
  item_type: z.enum(LEXICAL_ITEM_TYPES),
  display_form: z.string().min(1),
  lemma: z.string().min(1),
  translation: z.string().nullable().optional(),
  part_of_speech: z.string().nullable().optional(),
  ipa: z.string().nullable().optional(),
  example: z.string().nullable().optional(),
  example_translation: z.string().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  extra_notes: z.string().nullable().optional(),
  audio_url: z.string().nullable().optional(),
  example_audio_url: z.string().nullable().optional(),
  level: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  legacy_level_word_id: z.string().nullable().optional(),
});
export type LexicalItemRow = z.infer<typeof lexicalItemRowSchema>;

/** record_lexical_attempt() 的回傳。 */
export const recordAttemptResultSchema = z.object({
  recorded: z.boolean(),
  reason: z.string().optional(),
  attempt_id: z.string().optional(),
  lexical_item_id: z.string().optional(),
  mastery_applied: z.boolean().optional(),
  mastery_level: z.number().optional(),
});
export type RecordAttemptResult = z.infer<typeof recordAttemptResultSchema>;

/**
 * 寬鬆解析一組列。
 *
 * 單一列不符合 schema 時【丟掉那一列並在 console 留下紀錄】，不是整批拋錯 ——
 * 一筆髒資料不應該讓整個練習頁面開不起來。回傳的每一列都保證通過驗證。
 */
export function parseRows<T>(
  schema: z.ZodType<T>,
  rows: unknown,
  label: string,
): T[] {
  if (!Array.isArray(rows)) {
    if (rows != null) console.error(`[lexical] ${label}: 預期陣列，收到`, typeof rows);
    return [];
  }
  const out: T[] = [];
  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
    else console.error(`[lexical] ${label}: 跳過不合格的列`, parsed.error.issues);
  }
  return out;
}
