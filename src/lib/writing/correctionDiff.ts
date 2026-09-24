/**
 * 把「原文」與「修正」的差異算出來，讓學生看得出【改了哪裡】。
 *
 * 為什麼需要這個
 *
 *   畫面上原本就是「原文 → 修正」兩行並排。短的修正沒問題
 *   （Many student thinks → Many students think，一眼就看到 s）。
 *   但 production 有 15.2% 的 correction 是整句改寫，兩行都是長句時，
 *   學生得自己逐字比對才找得到差異——那正是他最不擅長的事，
 *   而「找出自己哪裡錯了」本來就是這個功能存在的理由。
 *
 *   prompt 已經改成要求 correction 與 quote 同範圍（見 writingPrompts.ts），
 *   但那隻能降低發生率，不能保證。而且 quote 本來就是整句時，
 *   correction 本來就會是整句——那時同樣需要標出差異。
 *
 * 🛑 這裡【不做】任何修正判斷，只做文字比對。它不知道什麼是文法，
 *    也不該知道——正確與否是模型的職責，這裡只負責把差異指出來。
 */

/** 一段文字，以及它在這次比對裡的身分 */
export interface DiffSegment {
  /** same = 兩邊都有；removed = 只在原文；added = 只在修正 */
  kind: "same" | "removed" | "added";
  text: string;
}

export interface CorrectionDiff {
  /** 原文那一行：只含 same 與 removed */
  quote: DiffSegment[];
  /** 修正那一行：只含 same 與 added */
  correction: DiffSegment[];
  /**
   * 這次比對值不值得標示。
   *
   * 兩段文字如果一個字都沒共用，標出來就是「整段刪掉、整段加上」——
   * 跟沒標一樣，只是多了顏色。那種情況回 false，畫面就照原樣純文字呈現。
   */
  worthShowing: boolean;
}

/**
 * 切成「一個詞 + 它後面的空白」。
 *
 * 空白跟著前一個詞走，重組時才不會掉空格，也不會讓空白自己變成一個
 * 會match/不match 的 token（那會讓差異看起來散落得莫名其妙）。
 */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** 比對用的鍵：去掉前後空白。空白只影響呈現，不影響「是不是同一個詞」。 */
function key(token: string): string {
  return token.trim();
}

/**
 * 超過這個 token 數就不比對了。
 *
 * LCS 是 O(n×m)。正常的 quote 是一句話（幾十個 token），
 * 但模型偶爾會引很長一段。400×400 = 16 萬格仍是毫秒級，
 * 再大就不值得為了標色去算——直接回 worthShowing: false。
 */
const MAX_TOKENS = 400;

/** 把連續同類的片段併起來，避免一個詞一個 span */
function coalesce(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.kind === seg.kind) last.text += seg.text;
    else out.push({ ...seg });
  }
  return out;
}

export function diffCorrection(quote: string, correction: string): CorrectionDiff {
  const a = tokenize(quote);
  const b = tokenize(correction);

  const plain = (): CorrectionDiff => ({
    quote: quote ? [{ kind: "same", text: quote }] : [],
    correction: correction ? [{ kind: "same", text: correction }] : [],
    worthShowing: false,
  });

  if (a.length === 0 || b.length === 0) return plain();
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) return plain();

  // ── LCS ───────────────────────────────────────────
  // dp[i][j] = a[i..] 與 b[j..] 的最長共同子序列長度
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        key(a[i]) === key(b[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const quoteSegs: DiffSegment[] = [];
  const correctionSegs: DiffSegment[] = [];
  let shared = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      quoteSegs.push({ kind: "same", text: a[i] });
      correctionSegs.push({ kind: "same", text: b[j] });
      shared += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      quoteSegs.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      correctionSegs.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) quoteSegs.push({ kind: "removed", text: a[i++] });
  while (j < b.length) correctionSegs.push({ kind: "added", text: b[j++] });

  return {
    quote: coalesce(quoteSegs),
    correction: coalesce(correctionSegs),
    // 一個詞都沒共用 → 標色沒有意義。
    worthShowing: shared > 0,
  };
}
