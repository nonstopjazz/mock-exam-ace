/**
 * 一題只能作答一次。
 *
 * 🛑 為什麼不能用 state 當防線
 *
 *   四個練習頁原本都是這樣寫的：
 *
 *       const handleSelect = (index) => {
 *         if (showResult) return;      // ← showResult 是 React state
 *         setShowResult(true);
 *         recordPracticeAttempt(...);
 *       };
 *
 *   React 會批次處理更新，所以 setShowResult(true) 之後、重新 render 之前，
 *   showResult 仍然是 false。同一個 tick 裡的第二次點擊會【整個穿過去】。
 *
 *   結果不只是多一筆紀錄：快速點兩個【不同】的選項，兩個答案都會被記下來，
 *   一對一錯。學生答對的題目在資料裡變成也答錯過。
 *
 *   這跟閱讀那個「看結果」卡住是同一類——在 handler 裡讀 state，
 *   而 handler 可以在 re-render 之前跑第二次。
 *
 * ref 是同步的，所以閂鎖用 ref。這個檔案是它的純粹版本，沒有 React，
 * 所以規則測得動。
 */

export interface Latch {
  /** 拿到鎖回 true；已經被拿走回 false */
  tryAcquire(): boolean;
  /** 換下一題時放開 */
  release(): void;
  readonly locked: boolean;
}

export function createLatch(): Latch {
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() { locked = false; },
    get locked() { return locked; },
  };
}


/**
 * 寫入口的第二道防線：短時間內一模一樣的 attempt 只送一次。
 *
 * 🛑 這是【補網】，不是主要防線。主要防線是頁面的閂鎖。
 *    但寫入口只有一個，在這裡再擋一次，之後新增的練習頁忘了加閂鎖時
 *    也不會默默寫出重複資料。
 *
 * 🛑 窗口要短。學生本來就可能在同一次練習裡重複遇到同一個字
 *    （不同題型、複習、重做），那些是【真的】attempt，不可以被吃掉。
 *    500ms 內出現兩筆完全相同的，只可能是同一次點擊被算了兩次——
 *    人不可能在半秒內作答兩次還得到相同的對錯。
 */
export interface Deduper {
  isDuplicate(key: string, now: number): boolean;
}

export function createDeduper(windowMs = 500, maxKeys = 200): Deduper {
  const seen = new Map<string, number>();

  return {
    isDuplicate(key: string, now: number): boolean {
      // 長時間練習會累積很多 key，超過上限就把過期的清掉。
      // 🛑 先清再判斷——反過來的話這一次的 key 可能被自己清掉。
      if (seen.size >= maxKeys) {
        for (const [k, t] of seen) {
          if (now - t >= windowMs) seen.delete(k);
        }
      }

      const prev = seen.get(key);
      if (prev !== undefined && now - prev < windowMs) return true;

      seen.set(key, now);
      return false;
    },
  };
}

/**
 * 去重的鍵。
 *
 * 🛑 要把 correct 也算進去。同一個字、同一種題型、同一個 session，
 *    但一對一錯，那正是「點了兩個不同選項」的樣子——那是最需要被擋下來的
 *    情況，不是可以被放行的。
 */
export function attemptKey(input: {
  wordId: string;
  exerciseType: string;
  sessionId?: string | null;
  correct?: boolean | null;
}): string {
  return [
    input.sessionId ?? "-",
    input.wordId,
    input.exerciseType,
    input.correct === null || input.correct === undefined ? "-" : String(input.correct),
  ].join("|");
}
