/**
 * 標出 VC 題真正在考的那一次出現。
 *
 * 🛑 詞界規則必須跟 backfill 的 SQL【一模一樣】：`(?<![A-Za-z]) … (?![A-Za-z])`，
 *    大小寫不分。兩邊只要有一點差異，SQL 數到的第 2 次就不是畫面標的第 2 次——
 *    而畫面會理直氣壯地標在錯的字上，沒有任何錯誤訊息。
 *
 * 🛑 找不到就【什麼都不標】。資料漂移（文章被改過、anchor 沒跟著更新）時，
 *    寧可沒有粗體，也不要標到別的地方去。
 *
 * 🛑 不要「找不到就退回第一個」。那正是這整件事要消滅的行為。
 *
 * 沒有 React、沒有 supabase，所以規則可以直接測。
 */

export interface Segment {
  text: string;
  /** true = 這一段是被考的那一次出現 */
  marked: boolean;
}

/** 與 PassagePane 原本的分段方式一致：空行分段，去頭尾空白，丟掉空段 */
export const paragraphsOf = (text: string): string[] =>
  text.split(/\n{2,}|\r\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 🛑 這個 pattern 是與 SQL 的約定。改它就要同時改
 *    backfill_reading_question_target.sql，否則兩邊數出來的次序會不一樣。
 */
const targetRegex = (target: string) =>
  new RegExp(`(?<![A-Za-z])${escapeRegex(target)}(?![A-Za-z])`, "gi");

/**
 * 把文章切成段，並在第 occurrence 次出現的地方切出一個 marked 片段。
 *
 * 次序是【跨整篇文章】數的，不是每段各數各的——SQL 也是這樣數。
 */
export function highlightParagraphs(
  text: string,
  target: string | null,
  occurrence: number | null,
): Segment[][] {
  const paragraphs = paragraphsOf(text);
  const plain = () => paragraphs.map((p) => [{ text: p, marked: false }]);

  if (!target || !target.trim() || !occurrence || occurrence < 1) return plain();

  let seen = 0;
  let done = false;

  return paragraphs.map((paragraph) => {
    if (done) return [{ text: paragraph, marked: false }];

    const re = targetRegex(target);
    const segments: Segment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(paragraph)) !== null) {
      // 空字串匹配會讓 lastIndex 不動，迴圈就停不下來
      if (m[0].length === 0) { re.lastIndex++; continue; }

      seen++;
      if (seen === occurrence) {
        if (m.index > last) segments.push({ text: paragraph.slice(0, m.index), marked: false });
        segments.push({ text: m[0], marked: true });
        last = m.index + m[0].length;
        done = true;
        break;
      }
    }

    if (!done || segments.length === 0) return [{ text: paragraph, marked: false }];
    if (last < paragraph.length) segments.push({ text: paragraph.slice(last), marked: false });
    return segments;
  });
}

/** 這篇文章裡有沒有真的標到東西。畫面要據此決定要不要顯示說明 */
export const hasMark = (paragraphs: Segment[][]): boolean =>
  paragraphs.some((segs) => segs.some((s) => s.marked));
