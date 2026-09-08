/**
 * 英文作文的字數。
 *
 * 🛑「字數」是【單字數】，不是字元數。一篇 273 個字的作文有 1782 個字元，
 *    把後者標成「字」會讓學生以為自己寫了六倍的量。
 *
 * 這裡的定義必須與資料庫的 writing_texts.word_count 一致（以空白切分），
 * 否則同一篇作文在撰寫頁與列表頁會出現兩個不同的數字。
 * 資料庫端見 supabase/migrations/add_writing_texts_word_count.sql。
 *
 * 中文不適用：中文字之間沒有空白。這個系統的作文是英文，
 * 之後若要收中文作文，兩邊都要另外處理，不要沿用這個函式。
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}
