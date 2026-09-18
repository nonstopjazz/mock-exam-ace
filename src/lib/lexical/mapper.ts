import type { VocabularyWord } from "@/data/vocabulary/types";
import { packItemRowSchema, parseRows, type PackItemRow } from "./types";

/**
 * 唯一的語彙資料 mapper。
 *
 * 在這之前，`convertPackItemToVocabularyWord()` 在七個 practice 頁面裡
 * 各自複製了一份（內容略有差異：只有 Flashcards 與 SRSReview 帶音檔，
 * 只有 SRSReview 帶 pack_id）。那些副本全部改成 import 這裡。
 */

/** pack 來源的字詞一定知道自己屬於哪個 pack。level 來源的沒有這個欄位。 */
export type PackVocabularyWord = VocabularyWord & { pack_id: string };

/**
 * pack_items 一列 → 前端通用的 VocabularyWord。
 *
 * ⚠️ 有五個欄位是【結構性缺失】，不是這裡偷懶：
 *      synonyms / antonyms  —— pack_items 沒有這兩欄
 *      level                —— pack_items 沒有級別的概念
 *      tags / category      —— pack_items 沒有標籤
 *    所以「同義／反義詞」練習在 pack 來源下必然出不了題（候選清單恆為空），
 *    而 VocabularySelector 的 level／詞性／主題篩選對 pack 也無效。
 *    這是目前的資料現實，Phase 1 沒有改變它 —— canonical 的
 *    lexical_items 有這些欄位，但七個頁面這次還沒改讀新表。
 */
export function packItemToVocabularyWord(item: PackItemRow): PackVocabularyWord {
  return {
    id: item.id,
    pack_id: item.pack_id,
    word: item.word,
    translation: item.definition || "",
    ipa: item.phonetic || "",
    partOfSpeech: item.part_of_speech || "",
    example: item.example_sentence || "",
    exampleTranslation: "",
    synonyms: [],
    antonyms: [],
    level: 1,
    tags: [],
    difficulty: "medium",
    category: "",
    extraNotes: "",
    audioUrl: item.audio_url ?? null,
    exampleAudioUrl: item.example_audio_url ?? null,
  };
}

/** 一整批 pack_items。先驗證再轉換，不合格的列會被丟掉而不是讓頁面爆掉。 */
export function packItemsToVocabularyWords(items: PackItemRow[]): PackVocabularyWord[] {
  return items.map(packItemToVocabularyWord);
}

/** 直接從 Supabase 回傳值解析 + 轉換，用於還沒走 usePackItems 的地方。 */
export function parsePackItems(rows: unknown): PackItemRow[] {
  return parseRows(packItemRowSchema, rows, "pack_items");
}

/**
 * 從一個 VocabularyWord 推回它的 legacy 身分。
 *
 * record_lexical_attempt() 需要 (legacy_source, legacy_id) 才能在後端
 * 查 lexical_legacy_map 解析出 canonical item。
 *
 * 判斷依據是「這一輪練習選的來源」而不是 id 長得像什麼 ——
 * level_words.id 是 '4448' 這種字串、pack_items.id 是 uuid，
 * 雖然目前看得出差別，但靠形狀猜是脆弱的。
 */
export function legacyIdentity(
  word: Pick<VocabularyWord, "id">,
  source: "level" | "pack",
): { legacySource: "level_word" | "pack_item"; legacyId: string } {
  return {
    legacySource: source === "pack" ? "pack_item" : "level_word",
    legacyId: word.id,
  };
}
