import type { WordProgress } from "@/store/vocabularyStore";

/**
 * 把 get_all_word_progress 回傳的列轉成 store 用的 map。
 *
 * 🛑 map 的 key【必須】逐字等於 word_id，不可以加任何前綴。
 *
 *   在 2026-09-24 之前，pack 的列被放在 `pack:{pack_id}:{word_id}`，
 *   理由是「避免和 level word 的 id 相撞」。但寫入端
 *   （vocabularyStore.updateWordProgress / getWordProgress）一直是用
 *   【裸的 word_id】查與寫。
 *
 *   結果：題庫單字的進度載進來之後，練習頁永遠查不到它，於是每次都從 0
 *   重算，再把「複習次數 1」覆蓋回伺服器。題庫單字的熟練度因此永遠停在
 *   第一次，SRS 間隔也永遠是最短的那一檔——等於題庫沒有間隔重複。
 *
 *   production 實測（同一帳號、同一 pack item、起點 1、重新整理後再練一次）：
 *     複習次數 1 → 1，而最後練習時間有更新。確認是覆蓋，不是沒寫到。
 *
 *   而當初擔心的相撞【不可能發生】：level_words.id 是像 '4448' 的短數字字串
 *   （create_level_words_table.sql:8），pack_items.id 是 UUID。
 *   那個前綴沒有擋掉任何東西，只擋掉了學生自己的進度。
 *
 * 這一段刻意放在【不 import supabase 的模組】，這樣它可以被直接測試——
 * 上面那個 bug 正是那種讀程式碼看不出來、跑起來也不報錯的東西。
 */

/** get_all_word_progress 回傳的一列。欄位名是 SQL 那邊的 snake_case。 */
export interface WordProgressRow {
  word_id: string;
  mastery_level: number;
  next_review_time: number | string;
  review_count: number;
  correct_count: number;
  last_review_time: number | string | null;
  source?: string | null;
  pack_id?: string | null;
}

export function toWordProgressMap(rows: WordProgressRow[]): Record<string, WordProgress> {
  const map: Record<string, WordProgress> = {};

  for (const item of rows) {
    // key 就是 word_id。見上方 🛑。
    map[item.word_id] = {
      wordId: item.word_id,
      masteryLevel: item.mastery_level,
      nextReviewTime: Number(item.next_review_time),
      reviewCount: item.review_count,
      correctCount: item.correct_count,
      lastReviewTime: item.last_review_time ? Number(item.last_review_time) : null,
      source: (item.source as WordProgress["source"]) || "level",
      packId: item.pack_id || null,
    };
  }

  return map;
}
