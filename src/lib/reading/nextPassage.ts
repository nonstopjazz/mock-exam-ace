/**
 * 「下一篇練哪一篇」的規則。
 *
 * 每一篇文章都固定考六個 construct，所以沒有「依能力挑文章」這回事——
 * 挑哪一篇都在練同樣六種能力。既然如此，就不該把選擇丟給學生：
 * 首頁只要回答「現在開始下一篇」。
 *
 * 🛑 第一版【刻意不做推薦】。deterministic 的順序有一個推薦演算法給不了的
 *    性質：同一個人今天按跟明天按，拿到的是同一篇。學生中斷了回來，
 *    畫面不會變成另一篇；而出問題時我們重現得出來。
 *
 * 🛑 順序由呼叫端決定（目前是 passage_id 遞增）。這裡不排序——
 *    在兩個地方各排一次，遲早會排得不一樣。
 *
 * 沒有 React、沒有 supabase，所以規則可以直接測。
 */

export interface PassageProgress {
  passage_id: string;
  /** 沒練過是 null */
  sessionStatus: "IN_PROGRESS" | "SUBMITTED" | null;
  /** 只有 IN_PROGRESS 時有意義 */
  startedAt?: string | null;
}

export type NextPick =
  /** 有做到一半的，回去接著做 */
  | { kind: "resume"; passageId: string }
  /** 下一篇還沒練過的 */
  | { kind: "next"; passageId: string }
  /** 全部練完了 */
  | { kind: "done" }
  /** 一篇都沒有（題庫還沒上架） */
  | { kind: "empty" };

/**
 * 🛑 未完成的優先於未開始。學生上次按到一半離開，回來卻被丟到新的一篇，
 *    那筆做到一半的紀錄就永遠留在那裡——而他以為自己練過了。
 *
 * 多筆未完成時取【最後開始的那一筆】：那是他記得的那一篇。
 */
export function pickNext(items: PassageProgress[]): NextPick {
  if (items.length === 0) return { kind: "empty" };

  let resume: PassageProgress | null = null;
  for (const p of items) {
    if (p.sessionStatus !== "IN_PROGRESS") continue;
    if (resume === null) { resume = p; continue; }
    // startedAt 缺了就維持先到先贏，不要讓沒有時間的那筆莫名其妙插隊
    if ((p.startedAt ?? "") > (resume.startedAt ?? "")) resume = p;
  }
  if (resume) return { kind: "resume", passageId: resume.passage_id };

  const fresh = items.find((p) => p.sessionStatus === null);
  if (fresh) return { kind: "next", passageId: fresh.passage_id };

  return { kind: "done" };
}

/** 完成度。分母是學生【看得到】的篇數，不是題庫總數 */
export const progressOf = (items: PassageProgress[]) => ({
  done: items.filter((p) => p.sessionStatus === "SUBMITTED").length,
  total: items.length,
});

// ── 每一篇的練習狀態 ────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  passage_id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";
  started_at: string;
}

export interface PassageProgressValue {
  status: "IN_PROGRESS" | "SUBMITTED";
  startedAt: string | null;
}

/**
 * 把 session 收斂成「每一篇的狀態」。
 *
 * 🛑 一題都沒答的 IN_PROGRESS【不算做到一半】。
 *    reading_start_session 在打開文章的當下就建 session，所以「點進去看一眼
 *    再退出來」也會留下一筆 IN_PROGRESS。把它當成進度，首頁就會對著一個
 *    從來沒作答過的人說「繼續上次練習」——而他知道自己沒有。
 *
 * 🛑 已經交過就是交過。重做時會開一筆新的 IN_PROGRESS，不能讓它蓋掉
 *    「這篇練過了」。
 *
 * @param sessions          依 started_at 遞減排序
 * @param answeredSessionIds 至少有一筆作答的 session
 */
export function progressByPassage(
  sessions: SessionRow[],
  answeredSessionIds: Set<string>,
): Map<string, PassageProgressValue> {
  const out = new Map<string, PassageProgressValue>();

  for (const row of sessions) {
    if (row.status === "ABANDONED") continue;
    if (row.status === "IN_PROGRESS" && !answeredSessionIds.has(row.id)) continue;

    const current = out.get(row.passage_id);
    if (current?.status === "SUBMITTED") continue;

    out.set(row.passage_id, {
      status: row.status,
      // 遞減排序，所以先寫進去的那筆就是最後開始的
      startedAt: current?.startedAt ?? row.started_at,
    });
  }

  return out;
}
